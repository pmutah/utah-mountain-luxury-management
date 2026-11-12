import { corsJson } from '../../_lib/data';
import { hostDenied, hostOnly } from '../../_lib/auth';
import { kvGet, kvPut, storageReadPaused } from '../../_lib/kv-json';
import {
  daySawRealComps,
  mergeSavedShadowDay,
  SHADOW_UNREAD,
  shadowClockFromSaved,
  type SavedShadowDay,
} from '../../../src/lib/market/shadow-log';
import { denverToday } from '../../../src/lib/market/dates';
import { audit, auditActorFor } from '../../_lib/platform/audit-store';
import type { SettingsEnv } from '../../_lib/kv';

const KV_KEY = 'shadowDays';
const DATE = /^\d{4}-\d{2}-\d{2}$/;

type Env = SettingsEnv & { DASHBOARD_PASSWORD?: string; HOSPITABLE_WRITE_TOKEN?: string; HOSPITABLE_PAT?: string };

function safeDays(value: unknown): SavedShadowDay[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (day): day is SavedShadowDay =>
      Boolean(day) &&
      typeof day === 'object' &&
      DATE.test((day as SavedShadowDay).date ?? '') &&
      typeof (day as SavedShadowDay).digest === 'string',
  );
}

/**
 * The shadow clock the server keeps. Reading it does not send a rate. A write token, when one is
 * set, is never returned; the route only says whether one exists.
 */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  let saved: SavedShadowDay[];
  try {
    saved = safeDays(await kvGet<SavedShadowDay[]>(env, KV_KEY, []));
  } catch (err) {
    if (storageReadPaused(err)) {
      return corsJson(request, { clock: null, storageReads: 'paused' }, 503);
    }
    const message = err instanceof Error ? err.message : 'Shadow days failed';
    return corsJson(request, { error: message }, 500);
  }
  const today = denverToday();
  const clock = shadowClockFromSaved(saved, today);
  return corsJson(
    request,
    {
      clock,
      /*
       * Either name counts — the sender uses `HOSPITABLE_PAT`, and this reported only the older name. A host reading "no write
       * token" while the PAT was configured would go looking for a secret that already existed.
       */
      hasWriteToken: Boolean(env.HOSPITABLE_PAT?.trim() || env.HOSPITABLE_WRITE_TOKEN?.trim()),
      days: saved.map((day) => ({ date: day.date })),
      storageReads: 'ok',
    },
    200,
    { 'Cache-Control': 'no-store' },
  );
};

/** Save one Denver day. The digest has to carry the unsent line, and a sendable digest is refused. */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  let body: { date?: unknown; digest?: unknown };
  try {
    body = (await request.json()) as { date?: unknown; digest?: unknown };
  } catch {
    return corsJson(request, { error: 'Invalid JSON' }, 400);
  }
  const date = typeof body.date === 'string' ? body.date : '';
  const digest = typeof body.digest === 'string' ? body.digest : '';
  if (!DATE.test(date)) return corsJson(request, { error: 'A Denver date is required.' }, 400);
  if (!digest.includes('Nothing sent to Hospitable.')) {
    return corsJson(request, { error: 'This digest is not an unsent shadow day.' }, 400);
  }
  /*
   * A digest that never names saved comps used to be stored and then counted. Seven of those would open the
   * rate gate. An unread day is the one exception: it is how a bad day is removed, and it does not count.
   */
  if (!digest.includes(SHADOW_UNREAD) && !daySawRealComps(digest)) {
    return corsJson(request, { error: 'This digest did not see saved comps, so the day was not saved.' }, 400);
  }
  let saved: SavedShadowDay[];
  try {
    saved = safeDays(await kvGet<SavedShadowDay[]>(env, KV_KEY, []));
  } catch (err) {
    if (storageReadPaused(err)) {
      return corsJson(request, { error: 'Saved shadow days could not be read. Nothing was written.' }, 503);
    }
    throw err;
  }
  const merged = mergeSavedShadowDay(saved, { date, digest, savedAt: new Date().toISOString() });
  try {
    await kvPut(env, KV_KEY, merged);
  } catch (err) {
    if (storageReadPaused(err)) {
      return corsJson(request, { error: 'Saved shadow days could not be written.' }, 503);
    }
    throw err;
  }
  /*
   * A saved shadow day is what unlocks the switch to live pricing, so the day is recorded. Only the date — the digest text is
   * already in the shadow list and repeating it here would double the log for no one's benefit.
   */
  const logged = await audit(env, {
    actor: auditActorFor(request, env),
    action: 'pricing.shadow-day',
    target: date,
    note: 'An unsent shadow day was saved.',
  });
  return corsJson(
    request,
    {
      clock: shadowClockFromSaved(merged, denverToday()),
      days: merged.map((day) => ({ date: day.date })),
      ...(logged.ok ? {} : { auditFailed: logged.reason }),
    },
    200,
    { 'Cache-Control': 'no-store' },
  );
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
