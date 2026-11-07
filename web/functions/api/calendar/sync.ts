import { hostDenied, hostOnly } from '../../_lib/auth';
import { corsJson } from '../../_lib/data';
import { syncIcalAndReservations } from '../../_lib/calendar-store';
import type { AgentEnv } from '../../_lib/agent/types';

export const onRequestPost: PagesFunction<AgentEnv> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  try {
    const synced = await syncIcalAndReservations(env);
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
      line: cleaningError
        ? `The stays synced, but the turnover cleaning expenses did not: ${cleaningError}`
        : null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return corsJson(request, { error: message }, 500);
  }
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
