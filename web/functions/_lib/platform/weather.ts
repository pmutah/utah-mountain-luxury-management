/**
 * Live weather, snow, and canyon advisories from the National Weather Service.
 *
 * The desk has said "Sundance snow is not connected" and "Provo Canyon road status is not connected" since the rebuild. Those
 * lines were honest, and they were the whole feature: no forecast, no plow decision, no advisory for a guest driving up the
 * canyon in a storm.
 *
 * `api.weather.gov` needs no key and no account — only a `User-Agent` that identifies the caller, which is an NWS requirement
 * and also how they contact a heavy user. So this ships with nothing for the owner to buy or paste in.
 *
 * What it is careful about:
 *
 *   - **A failed read is not clear weather.** A network fault, a non-200, or a body that does not parse returns
 *     `{ ok: false }`, and the desk says the forecast could not be read. It never renders "no snow" because the request
 *     failed, which is the same defect this codebase keeps finding in its stores.
 *   - **Inches are converted, not assumed.** NWS gridpoint `snowfallAmount` arrives in millimetres under
 *     `wmoUnit:mm`; a figure taken as inches would multiply the plow threshold by 25.
 *   - **Nothing is dispatched.** `snowDispatch` says whether two inches is enough to send someone. No text goes out from here.
 */

import { snowDispatch } from '../../../src/lib/platform/guest-ops';

export type HousePoint = { id: 'ranch' | 'lindon' | 'river'; label: string; lat: number; lon: number };

/**
 * The three houses, at the precision the NWS grid needs.
 *
 * These are the towns and the canyon, not a rooftop: the grid cell is about 2.5 km, and a door-precision coordinate would
 * imply an accuracy the forecast does not have.
 */
export const HOUSE_POINTS: readonly HousePoint[] = [
  { id: 'ranch', label: 'The Ranch House', lat: 40.3416, lon: -111.7206 },
  { id: 'lindon', label: 'The Lindon House', lat: 40.3403, lon: -111.7163 },
  { id: 'river', label: 'The River House', lat: 40.3487, lon: -111.5973 },
];

/** Sundance, because that is the snow a guest asks about and the depth the plow decision is really about. */
export const SUNDANCE = { label: 'Sundance', lat: 40.3925, lon: -111.5787 } as const;

/** The NWS asks every caller to name itself. A bare default UA is refused by their edge. */
export const NWS_USER_AGENT = '(wilhite-portfolio.pages.dev, pmutah@gmail.com)';

export type SnowWindow = {
  /** Inches expected in the next 48 hours, rounded to one decimal. */
  inches48: number;
  /** Inches by six-hour bucket, soonest first, as NWS reports them. */
  buckets: Array<{ startsAt: string; inches: number }>;
};

type GridValue = { validTime?: string; value?: number | null };

/**
 * Sum the next 48 hours of `snowfallAmount` out of a gridpoint payload.
 *
 * NWS publishes this as a list of `{ validTime: "2026-11-11T18:00:00+00:00/PT6H", value: <mm> }`. A `null` value means no
 * snow in that bucket, which is a real zero and not a missing read. A payload with no list at all returns `null`, because
 * "this grid has no snowfall product" is different from "it will not snow".
 */
export function snowFromGridpoint(payload: unknown, now: Date): SnowWindow | null {
  const values = dig(payload, 'properties', 'snowfallAmount', 'values');
  if (!Array.isArray(values)) return null;
  const buckets: Array<{ startsAt: string; inches: number }> = [];
  const horizon = now.getTime() + 48 * 3_600_000;
  for (const raw of values as GridValue[]) {
    if (!raw || typeof raw.validTime !== 'string') continue;
    const start = raw.validTime.split('/')[0];
    if (!start) continue;
    const at = Date.parse(start);
    if (!Number.isFinite(at) || at > horizon) continue;
    // A bucket that already ended is history, not a forecast.
    if (at < now.getTime() - 6 * 3_600_000) continue;
    const mm = typeof raw.value === 'number' && Number.isFinite(raw.value) ? raw.value : 0;
    buckets.push({ startsAt: start, inches: round1(mm / 25.4) });
  }
  if (buckets.length === 0) return null;
  buckets.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return { inches48: round1(buckets.reduce((sum, bucket) => sum + bucket.inches, 0)), buckets };
}

export type ForecastDay = {
  name: string;
  high: number | null;
  low: number | null;
  short: string;
  /** Percent chance of precipitation when NWS gives one. */
  precip: number | null;
};

/**
 * The next three days out of an NWS `forecast` payload.
 *
 * Day and night come as separate periods, so a day's low often arrives in the period *after* its high. This pairs them by
 * name, which is how the NWS itself labels them, and never invents a number it was not given.
 */
export function forecastFrom(payload: unknown, limit = 3): ForecastDay[] {
  const periods = dig(payload, 'properties', 'periods');
  if (!Array.isArray(periods)) return [];
  const days: ForecastDay[] = [];
  for (const raw of periods as Array<Record<string, unknown>>) {
    if (!raw || typeof raw.name !== 'string') continue;
    const isNight = raw.isDaytime === false;
    const name = raw.name.replace(/\s*Night$/i, '');
    const temp = typeof raw.temperature === 'number' ? raw.temperature : null;
    const precip = dig(raw, 'probabilityOfPrecipitation', 'value');
    const short = typeof raw.shortForecast === 'string' ? raw.shortForecast : '';
    if (isNight) {
      const existing = days.find((day) => day.name === name);
      if (existing && existing.low === null) existing.low = temp;
      continue;
    }
    if (days.some((day) => day.name === name)) continue;
    days.push({ name, high: temp, low: null, short, precip: typeof precip === 'number' ? precip : null });
    if (days.length >= limit) break;
  }
  return days;
}

export type Alert = { event: string; severity: string; headline: string; ends: string | null };

type Read<T> = { ok: true; value: T } | { ok: false; error: string };

/** Active alerts, reduced to what a desk or a guest line needs. */
export function alertsFrom(payload: unknown, limit = 4): Alert[] {
  const features = dig(payload, 'features');
  if (!Array.isArray(features)) return [];
  const out: Alert[] = [];
  for (const raw of features as Array<Record<string, unknown>>) {
    const props = dig(raw, 'properties') as Record<string, unknown> | null;
    if (!props) continue;
    const event = typeof props.event === 'string' ? props.event : '';
    if (!event) continue;
    out.push({
      event,
      severity: typeof props.severity === 'string' ? props.severity : 'Unknown',
      headline: typeof props.headline === 'string' ? props.headline : '',
      ends: typeof props.ends === 'string' ? props.ends : null,
    });
    if (out.length >= limit) break;
  }
  return out;
}

export type Conditions = {
  ok: boolean;
  reason?: string;
  readAt: string;
  snow: SnowWindow | null;
  /** Sundance's forecast, which is the one a skier asks about. */
  sundance: { days: ForecastDay[]; snow: SnowWindow | null } | null;
  /** Per house, the short forecast a guest page can show. */
  houses: Array<{ id: string; days: ForecastDay[] }>;
  alerts: Alert[];
  /** Whether two inches is enough to send the plow. It never sends anything. */
  plow: { dispatch: boolean; reason: string };
};

/**
 * Read the whole picture.
 *
 * `fetchImpl` is a parameter so a test can drive real payloads without a network, and so the route can pass the runtime's own
 * `fetch`. Every request carries the identifying User-Agent the NWS requires.
 */
export async function readConditions(
  fetchImpl: typeof fetch,
  now: Date = new Date(),
): Promise<Conditions> {
  const readAt = now.toISOString();
  const [sundanceSnow, sundanceForecast, alerts, ...houseForecasts] = await Promise.all([
    gridSnow(fetchImpl, SUNDANCE.lat, SUNDANCE.lon, now),
    pointForecast(fetchImpl, SUNDANCE.lat, SUNDANCE.lon),
    activeAlerts(fetchImpl, HOUSE_POINTS[2]!.lat, HOUSE_POINTS[2]!.lon),
    ...HOUSE_POINTS.map((point) => pointForecast(fetchImpl, point.lat, point.lon)),
  ]);

  const inches = sundanceSnow.ok ? sundanceSnow.value?.inches48 ?? null : null;
  const verdict = snowDispatch({ inches, live: sundanceSnow.ok });
  const anythingRead = sundanceSnow.ok || sundanceForecast.ok || alerts.ok || houseForecasts.some((row) => row.ok);
  return {
    ok: anythingRead,
    ...(anythingRead ? {} : { reason: 'The National Weather Service could not be reached. This is not clear weather.' }),
    readAt,
    snow: sundanceSnow.ok ? sundanceSnow.value : null,
    sundance: sundanceForecast.ok
      ? { days: sundanceForecast.value ?? [], snow: sundanceSnow.ok ? sundanceSnow.value : null }
      : null,
    houses: HOUSE_POINTS.map((point, index) => ({
      id: point.id,
      days: houseForecasts[index]?.ok ? (houseForecasts[index]!.value ?? []) : [],
    })),
    alerts: alerts.ok ? (alerts.value ?? []) : [],
    plow: { dispatch: verdict.dispatch, reason: verdict.reason },
  };
}

async function gridSnow(fetchImpl: typeof fetch, lat: number, lon: number, now: Date): Promise<Read<SnowWindow | null>> {
  const grid = await getJson(fetchImpl, `https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`);
  if (!grid.ok) return grid;
  const gridUrl = dig(grid.value, 'properties', 'forecastGridData');
  if (typeof gridUrl !== 'string') return { ok: true, value: null };
  const data = await getJson(fetchImpl, gridUrl);
  if (!data.ok) return data;
  return { ok: true, value: snowFromGridpoint(data.value, now) };
}

async function pointForecast(fetchImpl: typeof fetch, lat: number, lon: number): Promise<Read<ForecastDay[]>> {
  const grid = await getJson(fetchImpl, `https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`);
  if (!grid.ok) return grid;
  const url = dig(grid.value, 'properties', 'forecast');
  if (typeof url !== 'string') return { ok: true, value: [] };
  const data = await getJson(fetchImpl, url);
  if (!data.ok) return data;
  return { ok: true, value: forecastFrom(data.value) };
}

async function activeAlerts(fetchImpl: typeof fetch, lat: number, lon: number): Promise<Read<Alert[]>> {
  const data = await getJson(
    fetchImpl,
    `https://api.weather.gov/alerts/active?point=${lat.toFixed(4)},${lon.toFixed(4)}`,
  );
  if (!data.ok) return data;
  return { ok: true, value: alertsFrom(data.value) };
}

/** Active alerts at one point. Exported so the road read and the conditions read agree on one request and one parse. */
export async function readCanyonAlerts(fetchImpl: typeof fetch, lat: number, lon: number): Promise<Read<Alert[]>> {
  return activeAlerts(fetchImpl, lat, lon);
}

/**
 * One GET with the identifying header and a timeout.
 *
 * A timeout matters more than it looks: this runs inside the morning brief, and the NWS being slow must not hold the whole
 * brief open. Ten seconds is far longer than their normal response and short enough to fail visibly.
 */
async function getJson(fetchImpl: typeof fetch, url: string): Promise<Read<unknown>> {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), 10_000) : null;
  try {
    const response = await fetchImpl(url, {
      headers: { 'User-Agent': NWS_USER_AGENT, Accept: 'application/geo+json, application/json' },
      ...(controller ? { signal: controller.signal } : {}),
    });
    if (!response.ok) return { ok: false, error: `The weather service answered ${response.status}.` };
    const body = (await response.json()) as unknown;
    return { ok: true, value: body };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'The weather service could not be reached.';
    return { ok: false, error: message };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** A dotted path into an unknown JSON body, or null. */
function dig(value: unknown, ...path: string[]): unknown {
  let cursor: unknown = value;
  for (const key of path) {
    if (!cursor || typeof cursor !== 'object') return null;
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return cursor ?? null;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * One line for the desk.
 *
 * It says the number when there is one and says the read failed when it did not — never "0 inches" for a failed request.
 */
export function conditionsLine(conditions: Conditions): string {
  if (!conditions.ok) {
    return 'The National Weather Service could not be reached, so no forecast is shown. This is not clear weather.';
  }
  const snow = conditions.snow ? `${conditions.snow.inches48} in expected at Sundance over 48 hours` : 'No snow figure was returned';
  const alert = conditions.alerts[0] ? ` ${conditions.alerts[0].event}.` : '';
  return `${snow}. ${conditions.plow.reason}${alert}`;
}
