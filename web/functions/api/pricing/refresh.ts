import { hostDenied, hostOnly } from '../../_lib/auth';
import { corsJson } from '../../_lib/data';
import { refreshCompPrices, runPricingAlertCheck } from '../../_lib/pricing-store';
import { readOrRefuse } from '../../_lib/read-guard';
import type { AgentEnv } from '../../_lib/agent/types';

export const onRequestPost: PagesFunction<AgentEnv> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  const read = await readOrRefuse(
    request,
    async () => {
      const result = await refreshCompPrices(env, env.GEMINI_API_KEY);
      const alertsCreated = await runPricingAlertCheck(env);
      return { ...result, alertsCreated };
    },
    'Saved comps',
  );
  if (!read.ok) return read.response;
  return corsJson(request, read.value);
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
