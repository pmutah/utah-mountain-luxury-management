import { hostDenied, hostOnly } from '../../_lib/auth';
import { corsJson } from '../../_lib/data';
import { syncIcalAndReservations } from '../../_lib/calendar-store';
import { backfillStayPortals } from '../../_lib/stay-portal-backfill';
import type { AgentEnv } from '../../_lib/agent/types';

export const onRequestPost: PagesFunction<AgentEnv> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  try {
    const synced = await syncIcalAndReservations(env);
    /*
     * A stay that arrives by iCal was getting a calendar row and a cleaning fee but **no guest portal**. The one
     * iCal booking on production had no token at all, and the mint route is host-gated and manual, so an overnight
     * booking sat invisible until somebody pressed a button. This runs the same batched, idempotent backfill after
     * every sync; it never sends, and it cannot move a link a guest already holds.
     *
     * A failure here must not fail the sync: the calendar and the books are the important half, and the response
     * reports the portal result separately rather than presenting a partial run as a clean one.
     */
    const portals = await backfillStayPortals(env);
    /*
     * The bookings saved even when the turnover cleaning rows did not, so a bare 200 with a nested
     * error would read as a clean run. The line says which half succeeded.
     */
    const cleaningError = synced.reservationSync.cleaningError;
    return corsJson(request, {
      eventCount: synced.events.length,
      fetchedAt: synced.fetchedAt,
      reservationSync: synced.reservationSync,
      discrepancyCount: synced.discrepancies.length,
      portals,
      line: [
        cleaningError ? `The stays synced, but the turnover cleaning expenses did not: ${cleaningError}` : '',
        portals.error ? `The stays synced, but a guest portal could not be made: ${portals.error}` : '',
      ]
        .filter(Boolean)
        .join(' '),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return corsJson(request, { error: message }, 500);
  }
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
