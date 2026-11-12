/**
 * Provo River at Vivian Park, from the keyless USGS instantaneous-values service.
 *
 * Gauge 10163000. Discharge is parameter 00060 (cubic feet per second). Water temperature is 00010 (°C).
 * A failed read is `ok: false`. This module never substitutes a calm river for a missing one.
 */

export const VIVIAN_PARK_SITE = '10163000';
export const USGS_IV_URL =
  'https://waterservices.usgs.gov/nwis/iv/?format=json&sites=10163000&parameterCd=00060,00010';

export type RiverState = 'prime' | 'swift' | 'high';

export type RiverFlow =
  | {
      ok: true;
      site: string;
      cfs: number;
      tempF: number | null;
      observedAt: string | null;
      state: RiverState;
      line: string;
    }
  | { ok: false; site: string; reason: string };

type Series = {
  variable?: { variableCode?: Array<{ value?: string }> };
  values?: Array<{ value?: Array<{ value?: string; dateTime?: string }> }>;
};

export function classifyRiver(cfs: number): RiverState {
  if (cfs < 350) return 'prime';
  if (cfs <= 750) return 'swift';
  return 'high';
}

export function riverStateLine(cfs: number, state: RiverState): string {
  if (state === 'prime') return `${Math.round(cfs)} cfs at Vivian Park. Prime for wading and fly fishing.`;
  if (state === 'swift') return `${Math.round(cfs)} cfs at Vivian Park. Swift — experienced wading, and a tubing window.`;
  return `${Math.round(cfs)} cfs at Vivian Park. High spring runoff. Stay on the bank.`;
}

function cToF(celsius: number): number {
  return Math.round((celsius * 9) / 5 + 32);
}

export function parseUsgsInstant(payload: unknown): RiverFlow {
  const site = VIVIAN_PARK_SITE;
  const series = (payload as { value?: { timeSeries?: Series[] } } | null)?.value?.timeSeries;
  if (!Array.isArray(series) || series.length === 0) {
    return { ok: false, site, reason: 'USGS did not return a reading for Vivian Park.' };
  }
  let cfs: number | null = null;
  let tempC: number | null = null;
  let observedAt: string | null = null;
  for (const row of series) {
    const code = row.variable?.variableCode?.[0]?.value;
    const point = row.values?.[0]?.value?.at(-1);
    const raw = point?.value;
    const number = raw === undefined ? NaN : Number(raw);
    if (!Number.isFinite(number)) continue;
    if (code === '00060') {
      cfs = number;
      observedAt = point?.dateTime ?? observedAt;
    } else if (code === '00010') {
      tempC = number;
      observedAt = observedAt ?? point?.dateTime ?? null;
    }
  }
  if (cfs === null) return { ok: false, site, reason: 'USGS returned no discharge for Vivian Park.' };
  const state = classifyRiver(cfs);
  const tempF = tempC === null ? null : cToF(tempC);
  const temp = tempF === null ? '' : ` Water is ${tempF}°F.`;
  return {
    ok: true,
    site,
    cfs,
    tempF,
    observedAt,
    state,
    line: `${riverStateLine(cfs, state)}${temp}`,
  };
}

export async function readRiverFlow(fetchImpl: typeof fetch): Promise<RiverFlow> {
  try {
    const response = await fetchImpl(USGS_IV_URL, { headers: { accept: 'application/json' } });
    if (!response.ok) return { ok: false, site: VIVIAN_PARK_SITE, reason: `USGS answered ${response.status}.` };
    return parseUsgsInstant(await response.json());
  } catch {
    return { ok: false, site: VIVIAN_PARK_SITE, reason: 'USGS could not be reached.' };
  }
}
