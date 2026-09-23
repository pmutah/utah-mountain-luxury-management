import { corsJson } from '../../_lib/data';
import { annotateYieldPlan } from '../../_lib/agent-work';
import { buildYieldPlan } from '../../_lib/pricing-doctrine';
import type { AgentEnv } from '../../_lib/agent/types';

export const onRequestGet: PagesFunction<AgentEnv> = async ({ request, env }) => {
  const days = Math.min(365, Math.max(14, Number(new URL(request.url).searchParams.get('days')) || 90));
  return corsJson(request, await annotateYieldPlan(env, await buildYieldPlan(env, days)));
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
