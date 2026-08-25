import { corsJson } from '../../../_lib/data';
import { loadGmailTokens } from '../../../_lib/gmail-store';
import type { AgentEnv } from '../../../_lib/agent/types';

export const onRequestGet: PagesFunction<AgentEnv> = async ({ request, env }) => {
  const tokens = await loadGmailTokens(env);
  return corsJson(request, {
    connected: Boolean(tokens?.email),
    email: tokens?.email ?? null,
    oauthConfigured: Boolean(env.GOOGLE_OAUTH_CLIENT_ID?.trim() && env.GOOGLE_OAUTH_CLIENT_SECRET?.trim()),
  });
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
