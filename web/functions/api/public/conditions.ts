import { corsJson } from '../../_lib/data';
import {
  buildPublicConditions,
  type PublicConditionsPayload,
} from '../../_lib/platform/public-conditions';

export { buildPublicConditions, type PublicConditionsPayload };

const CACHE_TTL_MS = 10 * 60_000;

let cached: { expiresAt: number; payload: PublicConditionsPayload } | null = null;

export function clearPublicConditionsCache(): void {
  cached = null;
}

export const onRequestGet: PagesFunction = async ({ request }) => {
  const nowMs = Date.now();
  if (cached && cached.expiresAt > nowMs) {
    return corsJson(request, cached.payload, 200, {
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=600',
    });
  }

  const payload = await buildPublicConditions(fetch, new Date(nowMs));
  if (payload.ok || payload.river.ok) {
    cached = { expiresAt: nowMs + CACHE_TTL_MS, payload };
  }

  return corsJson(request, payload, 200, {
    'Cache-Control': payload.ok ? 'public, max-age=300, stale-while-revalidate=600' : 'no-store',
  });
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
