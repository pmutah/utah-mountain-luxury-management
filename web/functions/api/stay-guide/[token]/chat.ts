import { corsJson } from '../../../_lib/data';
import { askNora, loadConciergeChat, resolveConciergeStay } from '../../../_lib/guest-concierge';
import { readOrRefuse, withPausedGuard } from '../../../_lib/read-guard';
import type { AgentEnv } from '../../../_lib/agent/types';

type Env = AgentEnv & {
  DASHBOARD_PASSWORD?: string;
  HOME_ASSISTANT_URL?: string;
  HOME_ASSISTANT_TOKEN?: string;
};

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) =>
  withPausedGuard(
    request,
    async () => {
      const resolved = await resolveConciergeStay(request, env, String(params.token ?? ''));
      if ('response' in resolved) return resolved.response;
      const read = await readOrRefuse(request, () => loadConciergeChat(env, resolved.stay.token), 'This guest chat');
      if (!read.ok) return read.response;
      return corsJson(request, { messages: read.value }, 200, { 'Cache-Control': 'no-store' });
    },
    'This guest chat',
  );

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) =>
  withPausedGuard(
    request,
    async () => {
      const resolved = await resolveConciergeStay(request, env, String(params.token ?? ''));
      if ('response' in resolved) return resolved.response;
      let text = '';
      try {
        const body = (await request.json()) as { text?: string };
        text = typeof body.text === 'string' ? body.text : '';
      } catch {
        return corsJson(request, { error: 'Invalid JSON' }, 400);
      }
      const origin = new URL(request.url).origin;
      const result = await askNora(env, resolved.stay, text, origin);
      if ('error' in result) return corsJson(request, { error: result.error }, result.status);
      return corsJson(request, result, 200, { 'Cache-Control': 'no-store' });
    },
    'This guest chat',
  );

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
