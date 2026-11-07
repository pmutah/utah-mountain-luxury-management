/**
 * Keep the iCal calendar fresh without a human clicking sync.
 *
 * Airbnb and VRBO deliveries arrive as iCal feeds, and the only things that pulled them were an
 * explicit `POST /api/calendar/sync` and an agent tool call. Nothing scheduled it, so a host who did
 * not press sync saw a stale calendar — and a stale calendar means a house reads as open on a night
 * it is already booked, which is a double-booking waiting to happen. `syncIcalIfStale` already existed
 * for exactly this and simply had no caller.
 *
 * Three rules make it safe to run from a read path:
 *
 * 1. **Never block the read.** The response goes out first and the sync runs through
 *    `executionCtx.waitUntil`, so a slow or unreachable feed cannot hang a dashboard.
 * 2. **Never run twice at once.** Two tabs loading the dashboard would otherwise both see a stale
 *    cache and both fetch, doubling reads and writes on a deployment that has already hit its limit.
 *    The guard is a per-request flag on the env object plus the 30-minute staleness window.
 * 3. **Never turn a failure into a failed page.** A sync that throws is swallowed: the calendar
 *    read the caller already did is still the answer, and a stale calendar the host can see is
 *    better than an error page.
 */
import { isIcalSyncStale, loadIcalFeeds, syncIcalAndReservations } from './calendar-store';
import { storageReadPaused } from './kv-json';
import type { SettingsEnv } from './kv';

/** Set on the env object while a sync is in flight for this request. */
const SYNCING = Symbol('uml.icalSyncing');

type SyncBox = { [SYNCING]?: true };

export type SyncResult =
  /** Nothing was started: no feed configured, the cache is fresh, or a sync is already running. */
  | { started: false; reason: 'no-feeds' | 'fresh' | 'in-flight' }
  /**
   * The background check was launched. It returns before the feed config has been read, so it says
   * only that the attempt was made — never that a fetch actually happened. Callers must not treat
   * this as "the calendar is now current".
   */
  | { started: true; finished: Promise<void> };

/**
 * Start a background iCal sync when the cache is stale.
 *
 * Returns whether one started, so a route can say so if it wants to. It never throws: this sits on a
 * read path where a feed problem must not become a page problem.
 */
export function refreshIcalInBackground(
  env: SettingsEnv,
  ctx: { waitUntil?: (promise: Promise<unknown>) => void } | undefined,
): SyncResult {
  const box = env as unknown as SyncBox;
  if (box[SYNCING]) return { started: false, reason: 'in-flight' };

  /*
   * The staleness check needs the feed config, which is a read. It is started here and awaited inside
   * the background promise, so the caller's response is not held for it. A read failure ends the
   * attempt rather than guessing that the cache is fresh: guessing either way is worse than skipping
   * one cycle.
   */
  box[SYNCING] = true;
  const work = (async () => {
    try {
      const feeds = await loadIcalFeeds(env);
      if (!feeds.ranch && !feeds.lindon) return;
      if (!isIcalSyncStale(feeds.lastSyncedAt)) return;
      await syncIcalAndReservations(env);
    } catch (err) {
      // A paused store or an unreachable feed leaves the calendar as it was. Nothing is reported to
      // the guest as current, and the next stale window tries again.
      if (storageReadPaused(err)) return;
      return;
    } finally {
      delete box[SYNCING];
    }
  })();

  if (!ctx?.waitUntil) {
    /*
     * No runtime to hand this to — a test, or a plain fetch handler. The work is already running, so
     * it is left to settle and its rejection is swallowed; nothing is awaited, and the caller is not
     * blocked either way.
     */
    void work.catch(() => undefined);
    return { started: true, finished: work.catch(() => undefined) };
  }
  ctx.waitUntil(work);
  return { started: true, finished: work.catch(() => undefined) };
}
