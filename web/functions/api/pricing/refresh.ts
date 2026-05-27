import { corsJson } from '../../_lib/data';
import { refreshCompPrices, runPricingAlertCheck } from '../../_lib/pricing-store';
import type { AgentEnv } from '../../_lib/agent/types';

export const onRequestPost: PagesFunction<AgentEnv> = async ({ request, env }) => {
  const result = await refreshCompPrices(env, env.GEMINI_API_KEY);
  const alertsCreated = await runPricingAlertCheck(env);
  return corsJson(request, { ...result, alertsCreated });
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
