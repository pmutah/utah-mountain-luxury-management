import { corsJson } from '../../_lib/data';
import { loadPriceSnapshots } from '../../_lib/pricing-store';
import type { AgentEnv } from '../../_lib/agent/types';

export const onRequestGet: PagesFunction<AgentEnv> = async ({ request, env }) => {
  const url = new URL(request.url);
  const compId = url.searchParams.get('compId');
  let snaps = await loadPriceSnapshots(env);
  if (compId) snaps = snaps.filter((s) => s.compId === compId);
  return corsJson(request, { snapshots: snaps.slice(-100) });
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
