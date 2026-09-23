import { corsJson } from '../../../_lib/data';
import { isAuthenticated } from '../../../_lib/auth';
import { isMuseAuthorized } from '../../../_lib/muse/auth';
import { appendStayThread, loadStayThread, resolveConciergeStay } from '../../../_lib/guest-concierge';
import type { AgentEnv } from '../../../_lib/agent/types';

type Env = AgentEnv & { DASHBOARD_PASSWORD?: string };

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  const resolved = await resolveConciergeStay(request, env, String(params.token ?? ''));
  if ('response' in resolved) return resolved.response;
  const messages = await loadStayThread(env, resolved.stay.token);
  return corsJson(request, { messages }, 200, { 'Cache-Control': 'no-store' });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  if (!isMuseAuthorized(request, env) && !isAuthenticated(request, env)) {
    return corsJson(request, { error: 'Sign in required.' }, 401);
  }
  const resolved = await resolveConciergeStay(request, env, String(params.token ?? ''));
  if ('response' in resolved) return resolved.response;
  let text = '';
  try {
    const body = (await request.json()) as { text?: string };
    text = typeof body.text === 'string' ? body.text : '';
  } catch {
    return corsJson(request, { error: 'Invalid JSON' }, 400);
  }
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return corsJson(request, { error: 'Write a reply first.' }, 400);
  const message = await appendStayThread(env, resolved.stay.token, 'host', clean);
  return corsJson(request, { message }, 200, { 'Cache-Control': 'no-store' });
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
