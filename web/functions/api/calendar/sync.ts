import { corsJson } from '../../_lib/data';
import { syncIcalAndReservations } from '../../_lib/calendar-store';
import type { AgentEnv } from '../../_lib/agent/types';

export const onRequestPost: PagesFunction<AgentEnv> = async ({ request, env }) => {
  try {
    const synced = await syncIcalAndReservations(env);
    return corsJson(request, {
      eventCount: synced.events.length,
      fetchedAt: synced.fetchedAt,
      reservationSync: synced.reservationSync,
      discrepancyCount: synced.discrepancies.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return corsJson(request, { error: message }, 500);
  }
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
