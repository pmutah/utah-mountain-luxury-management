import { hostDenied, hostOnly } from '../../../_lib/auth';
import { corsJson } from '../../../_lib/data';
import { gmailHealth, loadGmailTokens } from '../../../_lib/gmail-store';
import { readOrRefuse } from '../../../_lib/read-guard';
import type { AgentEnv } from '../../../_lib/agent/types';

export const onRequestGet: PagesFunction<AgentEnv> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  const read = await readOrRefuse(request, () => loadGmailTokens(env), 'The Gmail connection');
  if (!read.ok) return read.response;
  /*
   * `connected` means "a send would work right now", not "an email string is on file". Both this route
   * and `/api/surveys` answer through `gmailHealth`, which runs the same token path a real send takes.
   */
  const health = await gmailHealth(env, read.value);
  return corsJson(request, { ...health, reconnectPath: '/api/integrations/gmail/connect' });
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
