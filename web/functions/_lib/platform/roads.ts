/**
 * Provo Canyon road status.
 *
 * The desk has printed one fixed sentence since the rebuild: "Provo Canyon road status is not connected. This map does not say
 * whether the road is open." That sentence is honest, and it is also the entire feature.
 *
 * There is no free, keyless, documented feed this code can call for road closures, so this module does not pretend there is.
 * It does the two things it can do truthfully:
 *
 *   1. **A winter-weather alert covering the canyon is a road fact a host needs now.** The NWS publishes those without a key,
 *      and "Winter Storm Warning in effect for the canyon" is actionable even though it is not a closure.
 *   2. **A UDOT key, when the owner adds one, unlocks a real status read** — and only once he also names the endpoint his key
 *      belongs to, because guessing a URL would produce a plausible failure that reads like a road report.
 *
 * With neither, it says the road is not connected. It never says a road is open, which is the one claim a wrong answer must
 * never make.
 */

import { HOUSE_POINTS, readCanyonAlerts } from './weather';

export type RoadStatus = {
  /** True only when a real road feed answered. */
  connected: boolean;
  /** What to print. Always safe to show. */
  line: string;
  /** True when a winter alert covers the canyon. Not a closure, and the line says so. */
  winterAlert: boolean;
  alerts: Array<{ event: string; headline: string }>;
  /** Why the road feed is not connected, when it is not. */
  reason?: string;
};

/**
 * Read the road picture.
 *
 * `key` is `UDOT_API_KEY`. A key alone is not enough to call a feed — the endpoint matters — so `endpoint` must be set too. Both
 * unset is the normal case today and is reported plainly.
 */
export async function roadStatus(
  fetchImpl: typeof fetch,
  key: string | undefined,
  endpoint?: string,
): Promise<RoadStatus> {
  const alerts = await readCanyonAlerts(fetchImpl, HOUSE_POINTS[2]!.lat, HOUSE_POINTS[2]!.lon);
  const listed = alerts.ok ? (alerts.value ?? []).filter(isWinter) : [];
  const winterAlert = listed.length > 0;
  const alertPart = winterAlert
    ? ` ${listed[0]!.event} covers Provo Canyon. A warning is not a closure; check UDOT before you drive.`
    : '';

  const token = (key ?? '').trim();
  const url = (endpoint ?? '').trim();
  if (!token || !url) {
    return {
      connected: false,
      line: winterAlert
        ? `Provo Canyon road status is not connected.${alertPart}`
        : 'Provo Canyon road status is not connected. This map does not say whether the road is open.',
      winterAlert,
      alerts: listed.map((alert) => ({ event: alert.event, headline: alert.headline })),
      reason: !token ? 'No UDOT key is set.' : 'No UDOT endpoint is set for that key.',
    };
  }

  let response: Response;
  try {
    response = await fetchImpl(url, {
      headers: { 'Ocp-Apim-Subscription-Key': token, Accept: 'application/json' },
    });
  } catch (err) {
    return {
      connected: false,
      line: `Provo Canyon road status could not be read just now.${alertPart}`,
      winterAlert,
      alerts: listed.map((alert) => ({ event: alert.event, headline: alert.headline })),
      reason: err instanceof Error ? err.message : 'The road feed could not be reached.',
    };
  }
  if (!response.ok) {
    return {
      connected: false,
      line: `Provo Canyon road status could not be read just now (${response.status}).${alertPart}`,
      winterAlert,
      alerts: listed.map((alert) => ({ event: alert.event, headline: alert.headline })),
      reason: `The road feed answered ${response.status}.`,
    };
  }
  /*
   * The payload shape is the owner's endpoint's business, not this module's: rather than parse a schema nobody here has seen, it
   * reports that the feed answered and lets the host read the source. A guessed parse would be worse than no parse.
   */
  return {
    connected: true,
    line: `The road feed answered. Read it before you rely on it.${alertPart}`,
    winterAlert,
    alerts: listed.map((alert) => ({ event: alert.event, headline: alert.headline })),
  };
}

function isWinter(alert: { event: string }): boolean {
  return /winter|snow|ice|storm|wind|fog|closure/i.test(alert.event);
}
