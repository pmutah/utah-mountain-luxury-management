import { hostDenied, hostOnly } from '../../_lib/auth';
import { deepHealth } from '../../_lib/platform/health';
import { failSoft, jsonResponse } from '../../_lib/platform/http';
import type { HealthEnv } from '../../_lib/platform/health';

export const onRequestGet: PagesFunction<HealthEnv> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  try {
    return jsonResponse(request, await deepHealth(env));
  } catch (err) {
    return failSoft(request, err, 'Platform health');
  }
};
