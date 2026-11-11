/**
 * The guest-side funnel beacon.
 *
 * Four steps, a house, and a random visit id. No address, name, phone, device, or cookie is sent, and the visit id
 * lives in this browser's `sessionStorage` only so one visit counts once. If the beacon fails, the page does not care:
 * a funnel row is telemetry, not a booking.
 */

export type FunnelStep = 'view' | 'quote' | 'checkout' | 'paid';

export const FUNNEL_STEPS: FunnelStep[] = ['view', 'quote', 'checkout', 'paid'];

const VISIT_KEY = 'uml.funnel.visit';

/** A random id for this visit. Not derived from anything about the person. */
export function visitId(store?: { getItem(key: string): string | null; setItem(key: string, value: string): void }): string {
  const kept = store?.getItem(VISIT_KEY);
  if (kept && /^[A-Za-z0-9_-]{8,64}$/.test(kept)) return kept;
  const made = `v${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`.slice(0, 40);
  store?.setItem(VISIT_KEY, made);
  return made;
}

/** Only the four steps, and only a house we rent. Anything else is not sent. */
export function funnelBody(step: string, house: string, visit: string): { step: string; house: string; visit: string } | null {
  if (!FUNNEL_STEPS.includes(step as FunnelStep)) return null;
  if (!['ranch', 'lindon', 'river'].includes(house)) return null;
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(visit)) return null;
  return { step, house, visit };
}

/**
 * Send one step. `prod` is false on the dev server, which proxies `/api` to production: a local page load must not
 * write rows into the live database.
 */
export async function sendFunnel(
  step: string,
  house: string,
  options: { prod: boolean; visit: string; fetchImpl?: typeof fetch; storage?: { getItem(key: string): string | null; setItem(key: string, value: string): void } },
): Promise<boolean> {
  if (!options.prod) return false;
  const visit = options.visit || visitId(options.storage);
  const body = funnelBody(step, house, visit);
  if (!body) return false;
  const doFetch = options.fetchImpl ?? fetch;
  try {
    const res = await doFetch('/api/funnel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true,
    });
    return res.ok;
  } catch {
    return false;
  }
}
