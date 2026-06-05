import { corsJson } from '../../_lib/data';
import { syncIcalAndReservations } from '../../_lib/calendar-store';
import type { AgentEnv } from '../../_lib/agent/types';

export const onRequestPost: PagesFunction<AgentEnv> = async ({ request, env }) => {
  const synced = await syncIcalAndReservations(env);
  return corsJson(request, {
    eventCount: synced.events.length,
    fetchedAt: synced.fetchedAt,
    reservationSync: synced.reservationSync,
    discrepancies: synced.discrepancies,
  });
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
