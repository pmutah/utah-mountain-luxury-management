import { corsJson } from '../../_lib/data';
import { syncIcalFeeds, checkCalendarDiscrepancies } from '../../_lib/calendar-store';
import type { AgentEnv } from '../../_lib/agent/types';

export const onRequestPost: PagesFunction<AgentEnv> = async ({ request, env }) => {
  const synced = await syncIcalFeeds(env);
  const discrepancies = await checkCalendarDiscrepancies(env);
  return corsJson(request, {
    eventCount: synced.events.length,
    fetchedAt: synced.fetchedAt,
    discrepancies,
  });
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
