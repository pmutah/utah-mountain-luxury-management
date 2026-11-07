import { hostDenied, hostOnly } from '../../_lib/auth';
import { corsJson } from '../../_lib/data';
import { annotateYieldPlan } from '../../_lib/agent-work';
import { buildYieldPlan } from '../../_lib/pricing-doctrine';
import { readOrRefuse } from '../../_lib/read-guard';
import type { AgentEnv } from '../../_lib/agent/types';

export const onRequestGet: PagesFunction<AgentEnv> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  const days = Math.min(365, Math.max(14, Number(new URL(request.url).searchParams.get('days')) || 90));
  const read = await readOrRefuse(
    request,
    async () => annotateYieldPlan(env, await buildYieldPlan(env, days)),
    'Saved rate settings',
  );
  if (!read.ok) return read.response;
  return corsJson(request, read.value);
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
