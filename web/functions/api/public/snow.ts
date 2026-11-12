import { corsJson } from '../../_lib/data';
import { buildSnowReport, forecastUrl, type ResortSnow } from '../../../src/lib/snow-report';

/**
 * Every Utah resort's snow, in one request.
 *
 * A guest planning a ski day wants to know which mountain got the snow. Asking sixteen resort websites would be sixteen
 * scrapes that break whenever a resort redesigns; this asks Open-Meteo once for all sixteen points and caches the answer
 * at the edge for half an hour, which is faster than the models update.
 *
 * The response says what it is: modelled snowfall at upper mountain, not a resort's own snow-stake measurement. A resort
 * that could not be read is **absent from the rows**, and the payload says how many were expected, so the page can say
 * "eight of sixteen read" rather than drawing a blank as zero.
 */

const CACHE_SECONDS = 1800;
const CACHE_MS = CACHE_SECONDS * 1000;

export type PublicSnowPayload = {
  ok: boolean;
  /** ISO timestamp of the read, so the page can print when it was taken. */
  fetchedAt: string;
  /** How many resorts the table holds, versus how many this site knows about. */
  expected: number;
  rows: ResortSnow[];
  /** Plain-language source line. The page shows it, so it cannot drift from what the route did. */
  source: string;
};

let cached: { expiresAt: number; payload: PublicSnowPayload } | null = null;

export function clearPublicSnowCache(): void {
  cached = null;
}

export const onRequestGet: PagesFunction = async ({ request }) => {
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return corsJson(request, cached.payload, 200, {
      'Cache-Control': `public, max-age=${CACHE_SECONDS}, stale-while-revalidate=3600`,
    });
  }

  let payload: PublicSnowPayload = {
    ok: false,
    fetchedAt: new Date(now).toISOString(),
    expected: 16,
    rows: [],
    source: 'Open-Meteo modelled snowfall at upper mountain. Not a resort snow-stake measurement.',
  };

  try {
    const response = await fetch(forecastUrl(), {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(9000),
    });
    if (response.ok) {
      const rows = buildSnowReport(await response.json());
      payload = { ...payload, ok: rows.length > 0, rows };
    }
  } catch {
    // Leave ok:false and an empty table. The page says the snow could not be read rather than showing zeroes.
  }

  // Cache a good read, and also cache a bad one briefly so a failing upstream is not hammered by every visitor.
  cached = { expiresAt: now + (payload.ok ? CACHE_MS : 120_000), payload };
  return corsJson(request, payload, 200, {
    'Cache-Control': payload.ok ? `public, max-age=${CACHE_SECONDS}, stale-while-revalidate=3600` : 'no-store',
  });
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
