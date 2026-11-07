import { hostDenied, hostOnly } from '../../../_lib/auth';
import { corsJson } from '../../../_lib/data';
import { loadGmailTokens } from '../../../_lib/gmail-store';
import { readOrRefuse } from '../../../_lib/read-guard';
import type { AgentEnv } from '../../../_lib/agent/types';

export const onRequestGet: PagesFunction<AgentEnv> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  const read = await readOrRefuse(request, () => loadGmailTokens(env), 'The Gmail connection');
  if (!read.ok) return read.response;
  const tokens = read.value;
  return corsJson(request, {
    connected: Boolean(tokens?.email),
    email: tokens?.email ?? null,
    oauthConfigured: Boolean(env.GOOGLE_OAUTH_CLIENT_ID?.trim() && env.GOOGLE_OAUTH_CLIENT_SECRET?.trim()),
  });
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
