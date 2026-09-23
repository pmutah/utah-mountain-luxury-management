import { corsJson } from '../../../_lib/data';
import { resolveConciergeStay, textHost } from '../../../_lib/guest-concierge';
import type { AgentEnv } from '../../../_lib/agent/types';

type Env = AgentEnv & { DASHBOARD_PASSWORD?: string };

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  const resolved = await resolveConciergeStay(request, env, String(params.token ?? ''));
  if ('response' in resolved) return resolved.response;
  let note = '';
  try {
    const body = (await request.json()) as { note?: string };
    note = typeof body.note === 'string' ? body.note : '';
  } catch {
    return corsJson(request, { error: 'Invalid JSON' }, 400);
  }
  const origin = new URL(request.url).origin;
  const result = await textHost(env, resolved.stay, note, origin);
  return corsJson(request, result, 200, { 'Cache-Control': 'no-store' });
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
