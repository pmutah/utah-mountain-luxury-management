import type { ResortSnow } from './snow-report';

/** What `/api/public/snow` answers. Mirrors `PublicSnowPayload` in the route. */
export type PublicSnow = {
  ok: boolean;
  fetchedAt: string;
  expected: number;
  rows: ResortSnow[];
  source: string;
};

export type PublicSnowState =
  | { state: 'loading' }
  | { state: 'ready'; payload: PublicSnow }
  | { state: 'unread' };

let clientCache: { at: number; payload: PublicSnow } | null = null;
const CLIENT_MS = 15 * 60_000;

/** Only for tests, so one case cannot leak its answer into the next. */
export function resetPublicSnowClientCache(): void {
  clientCache = null;
}

/**
 * The resort snow table, read once per tab and reused.
 *
 * A failed read is `unread`, never an empty table dressed up as "no snow": a page that shows sixteen zeroes because the
 * network blinked is telling a guest the mountains are bare.
 */
export async function loadPublicSnow(fetchImpl: typeof fetch = fetch): Promise<PublicSnow | null> {
  if (clientCache && Date.now() - clientCache.at < CLIENT_MS) return clientCache.payload;
  try {
    const response = await fetchImpl('/api/public/snow', { headers: { Accept: 'application/json' } });
    if (!response.ok) return null;
    const payload = (await response.json()) as PublicSnow;
    if (!payload || !Array.isArray(payload.rows) || payload.rows.length === 0) return null;
    clientCache = { at: Date.now(), payload };
    return payload;
  } catch {
    return null;
  }
}

/** "updated 8:05 AM", from the ISO read time. Empty when it cannot be parsed. */
export function snowUpdatedLabel(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  return at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Denver' });
}
