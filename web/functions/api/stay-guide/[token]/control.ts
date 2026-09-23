import { corsJson } from '../../../_lib/data';
import { controlHouse, resolveConciergeStay } from '../../../_lib/guest-concierge';
import type { AgentEnv } from '../../../_lib/agent/types';

type Env = AgentEnv & { DASHBOARD_PASSWORD?: string };

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  const resolved = await resolveConciergeStay(request, env, String(params.token ?? ''));
  if ('response' in resolved) return resolved.response;
  let body: { name?: string; action?: string; brightness?: number } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return corsJson(request, { error: 'Invalid JSON' }, 400);
  }
  const result = await controlHouse(env, resolved.stay, body);
  return corsJson(request, result, 200, { 'Cache-Control': 'no-store' });
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
