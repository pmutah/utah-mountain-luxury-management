import { corsJson } from '../../../_lib/data';
import {
  conciergeSession,
  conciergeSessionRoom,
  markConciergeSession,
  resolveConciergeStay,
} from '../../../_lib/guest-concierge';
import type { AgentEnv } from '../../../_lib/agent/types';

type Env = AgentEnv & { DASHBOARD_PASSWORD?: string; XAI_API_KEY?: string };

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  const resolved = await resolveConciergeStay(request, env, String(params.token ?? ''));
  if ('response' in resolved) return resolved.response;

  const key = env.XAI_API_KEY?.trim();
  if (!key) {
    return corsJson(request, { error: 'Nora is not connected yet. Text or call us and we will help.' }, 503);
  }

  const room = await conciergeSessionRoom(env, resolved.stay.token);
  if (!room.ok) return corsJson(request, { error: room.error }, 429);

  const session = conciergeSession(resolved.stay);
  const minted = await mintClientSecret(key, session);
  if (!minted.value) {
    return corsJson(request, { error: 'Nora could not start. Text or call us and we will help.' }, 502);
  }
  await markConciergeSession(env, resolved.stay.token);
  return corsJson(
    request,
    { clientSecret: minted.value, expiresAt: minted.expires_at, session },
    200,
    { 'Cache-Control': 'no-store' },
  );
};

async function mintClientSecret(
  key: string,
  session: ReturnType<typeof conciergeSession>,
): Promise<{ value?: string; expires_at?: number }> {
  const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  const withSession = await fetch('https://api.x.ai/v1/realtime/client_secrets', {
    method: 'POST',
    headers,
    body: JSON.stringify({ expires_after: { seconds: 1800 }, session }),
  });
  if (withSession.ok) return (await withSession.json()) as { value?: string; expires_at?: number };
  const plain = await fetch('https://api.x.ai/v1/realtime/client_secrets', {
    method: 'POST',
    headers,
    body: JSON.stringify({ expires_after: { seconds: 1800 } }),
  });
  if (!plain.ok) return {};
  return (await plain.json()) as { value?: string; expires_at?: number };
}

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
