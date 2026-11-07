import { corsJson } from '../../../_lib/data';
import { hostOnly } from '../../../_lib/auth';
import { appendStayThread, loadStayThread, resolveConciergeStay } from '../../../_lib/guest-concierge';
import { readOrRefuse, withPausedGuard, pausedResponse } from '../../../_lib/read-guard';
import { storageReadPaused } from '../../../_lib/kv-json';
import type { AgentEnv } from '../../../_lib/agent/types';

type Env = AgentEnv & { DASHBOARD_PASSWORD?: string };

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) =>
  withPausedGuard(
    request,
    async () => {
      const resolved = await resolveConciergeStay(request, env, String(params.token ?? ''));
      if ('response' in resolved) return resolved.response;
      const read = await readOrRefuse(request, () => loadStayThread(env, resolved.stay.token), 'This guest thread');
      if (!read.ok) return read.response;
      return corsJson(request, { messages: read.value }, 200, { 'Cache-Control': 'no-store' });
    },
    'This guest thread',
  );

/**
 * The host's reply, which the guest app shows. It has to fail closed: `isAuthenticated` returns true
 * when DASHBOARD_PASSWORD is unset, so a deployment with no password let anyone post into a guest's
 * thread as the host.
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  if (!hostOnly(request, env)) {
    return corsJson(
      request,
      { error: 'Sign in required.', authRequired: true, code: 'sign-in' },
      401,
    );
  }
  const resolved = await resolveConciergeStay(request, env, String(params.token ?? '')).catch((err) => {
    if (!storageReadPaused(err)) throw err;
    return { response: pausedResponse(request, 'This guest thread') } as { response: Response };
  });
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
  const read = await readOrRefuse(
    request,
    () => appendStayThread(env, resolved.stay.token, 'host', clean),
    'This guest thread',
  );
  if (!read.ok) return read.response;
  return corsJson(request, { message: read.value }, 200, { 'Cache-Control': 'no-store' });
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
