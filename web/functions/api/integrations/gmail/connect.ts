import { corsJson } from '../../../_lib/data';
import { gmailOAuthUrl } from '../../../_lib/gmail-store';
import type { AgentEnv } from '../../../_lib/agent/types';

export const onRequestGet: PagesFunction<AgentEnv> = async ({ request, env }) => {
  const url = new URL(request.url);
  const origin = url.origin;
  const redirectUri = `${origin}/api/integrations/gmail/callback`;
  const authUrl = gmailOAuthUrl(env, redirectUri);
  if (!authUrl) {
    return corsJson(request, { error: 'Gmail OAuth not configured on server' }, 503);
  }
  return Response.redirect(authUrl, 302);
};
