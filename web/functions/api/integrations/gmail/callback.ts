import { exchangeGmailCode } from '../../../_lib/gmail-store';
import type { AgentEnv } from '../../../_lib/agent/types';

export const onRequestGet: PagesFunction<AgentEnv> = async ({ request, env }) => {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const origin = url.origin;
  const redirectUri = `${origin}/api/integrations/gmail/callback`;

  if (!code) {
    return Response.redirect(`${origin}/?gmail=error`, 302);
  }

  try {
    await exchangeGmailCode(env, code, redirectUri);
    return Response.redirect(`${origin}/?gmail=connected`, 302);
  } catch {
    return Response.redirect(`${origin}/?gmail=error`, 302);
  }
};
