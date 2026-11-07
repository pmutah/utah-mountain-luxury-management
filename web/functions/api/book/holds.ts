import { corsJson } from '../../_lib/data';
import { hostDenied, hostOnly } from '../../_lib/auth';
import { releaseHold, releaseHoldsForRequest, loadActiveHolds } from '../../_lib/hold-store';
import { storageReadPaused } from '../../_lib/kv-json';
import type { SettingsEnv } from '../../_lib/kv';

type Env = SettingsEnv & { DASHBOARD_PASSWORD?: string };

/** Host only. Lists the holds that still block a guest. No names and no prices. */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  try {
    const holds = await loadActiveHolds(env);
    return corsJson(
      request,
      {
        holds: holds.map((hold) => ({
          id: hold.id,
          propertyId: hold.propertyId,
          checkIn: hold.checkIn,
          checkOut: hold.checkOut,
          expiresAt: hold.expiresAt,
          requestId: hold.requestId,
        })),
        storageReads: 'ok',
      },
      200,
      { 'Cache-Control': 'no-store' },
    );
  } catch (err) {
    if (storageReadPaused(err)) return corsJson(request, { holds: null, storageReads: 'paused' }, 503);
    const message = err instanceof Error ? err.message : 'Holds failed';
    return corsJson(request, { error: message }, 500);
  }
};

/** Host only. Lets a hold go by id, or every hold for one request. It books nothing. */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  let body: { id?: unknown; requestId?: unknown };
  try {
    body = (await request.json()) as { id?: unknown; requestId?: unknown };
  } catch {
    return corsJson(request, { error: 'Invalid JSON' }, 400);
  }
  const id = typeof body.id === 'string' ? body.id.trim() : '';
  const requestId = typeof body.requestId === 'string' ? body.requestId.trim() : '';
  if (!id && !requestId) return corsJson(request, { error: 'An id or a requestId is required.' }, 400);
  try {
    const released = requestId ? await releaseHoldsForRequest(env, requestId) : await releaseHold(env, id);
    if (released === 0 || released === false) return corsJson(request, { error: 'Not found' }, 404);
    return corsJson(request, { ok: true }, 200, { 'Cache-Control': 'no-store' });
  } catch (err) {
    if (storageReadPaused(err)) {
      return corsJson(request, { error: 'The holds could not be read. Nothing was written.' }, 503);
    }
    const message = err instanceof Error ? err.message : 'Hold failed';
    return corsJson(request, { error: message }, 500);
  }
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
