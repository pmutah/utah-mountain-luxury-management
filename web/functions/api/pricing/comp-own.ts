import { hostDenied, hostOnly } from '../../_lib/auth';
import { corsJson } from '../../_lib/data';
import { readJsonBody } from '../../_lib/json-body';
import { setCompFlags } from '../../_lib/pricing-store';
import type { AgentEnv } from '../../_lib/agent/types';

/**
 * Correct the two facts that decide whether a saved comp may set a nightly band.
 *
 * `isOwn` marks one of our own listings. A house must never be compared with itself: two saved comps were
 * our own Lindon and Ranch listings, and the Ranch's highest-weight comp slept 20 at one mile, so
 * `liveCompFits` accepted it and our published ask entered the band as a market observation.
 *
 * `minNights` records the shortest stay a listing books. The Vineyard comp required 28 nights, so its rate
 * prices a month-long booking, not a night of the market this desk sells into.
 *
 * Only the fields sent are changed, so one route fixes either fact without clearing the other.
 */
export const onRequestPost: PagesFunction<AgentEnv> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  const parsed = await readJsonBody<{ id?: string; isOwn?: boolean; minNights?: number }>(request);
  if (!parsed.ok) return parsed.response;
  const id = parsed.body.id?.trim();
  if (!id) return corsJson(request, { error: 'id required' }, 400);

  const patch: { isOwn?: boolean; minNights?: number } = {};
  if (parsed.body.isOwn !== undefined) {
    if (typeof parsed.body.isOwn !== 'boolean') {
      return corsJson(request, { error: 'isOwn must be true or false' }, 400);
    }
    patch.isOwn = parsed.body.isOwn;
  }
  if (parsed.body.minNights !== undefined) {
    const nights = parsed.body.minNights;
    if (!Number.isInteger(nights) || nights < 1 || nights > 365) {
      return corsJson(request, { error: 'minNights must be a whole number of nights from 1 to 365' }, 400);
    }
    patch.minNights = nights;
  }
  if (Object.keys(patch).length === 0) {
    return corsJson(request, { error: 'Send isOwn or minNights' }, 400);
  }

  const comp = await setCompFlags(env, id, patch);
  if (!comp) return corsJson(request, { error: 'Not found' }, 404);
  return corsJson(request, { comp });
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
