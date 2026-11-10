import { hostDenied, hostOnly } from '../../_lib/auth';
import { corsJson } from '../../_lib/data';
import { annotateYieldPlan } from '../../_lib/agent-work';
import { buildYieldPlan } from '../../_lib/pricing-doctrine';
import { readOrRefuse, unexpectedResponse } from '../../_lib/read-guard';
import type { AgentEnv } from '../../_lib/agent/types';

export const onRequestGet: PagesFunction<AgentEnv> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  const days = Math.min(365, Math.max(14, Number(new URL(request.url).searchParams.get('days')) || 90));
  /*
   * The same boundary as `push-plan`, for the same reason: this route also answered Cloudflare's opaque `1102` page on
   * production. `readOrRefuse` handles a paused store, but it deliberately rethrows anything else, and an uncaught throw in
   * a Worker becomes a platform page that names neither the route nor the error.
   */
  try {
    const read = await readOrRefuse(
      request,
      async () => annotateYieldPlan(env, await buildYieldPlan(env, days)),
      'Saved rate settings',
    );
    if (!read.ok) return read.response;
    return corsJson(request, read.value);
  } catch (err) {
    return unexpectedResponse(request, err, 'The yield plan');
  }
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
