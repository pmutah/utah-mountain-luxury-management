import { hostDenied, hostOnly } from '../../../_lib/auth';
import { corsJson } from '../../../_lib/data';
import { getValidGmailToken, loadGmailTokens } from '../../../_lib/gmail-store';
import { readOrRefuse } from '../../../_lib/read-guard';
import type { AgentEnv } from '../../../_lib/agent/types';

export const onRequestGet: PagesFunction<AgentEnv> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  const read = await readOrRefuse(request, () => loadGmailTokens(env), 'The Gmail connection');
  if (!read.ok) return read.response;
  const tokens = read.value;
  /*
   * `connected` used to mean "an email string is on file", which was true while every send failed.
   * The dashboard said the mailbox was connected and the only symptom was silence, so a guest request
   * would sit in the inbox with no email and nobody would know why.
   *
   * A connection is only usable if the refresh token still works. This asks, once, and reports the
   * outcome. `connected` therefore means "we can send", and a dead token is reported beside the address
   * that owns it so reconnecting is an obvious next step rather than a mystery.
   */
  let canSend = false;
  let problem: string | null = null;
  /*
   * `getValidGmailToken` is the same path a send takes: it refreshes when the access token is stale and
   * throws when the refresh fails. Using it here means this check cannot disagree with a real send.
   */
  try {
    const valid = await getValidGmailToken(env);
    canSend = Boolean(valid?.accessToken);
    if (!canSend) problem = 'No mailbox is connected.';
  } catch (err) {
    problem = err instanceof Error ? err.message : 'The mailbox could not be reached.';
  }
  return corsJson(request, {
    /** True only when a send would actually work right now. */
    connected: canSend,
    /** The address on file, whether or not it currently works. */
    email: tokens?.email ?? null,
    /** Why it cannot send, in the words Google gave, so the fix is obvious. */
    problem,
    reconnectPath: '/api/integrations/gmail/connect',
    oauthConfigured: Boolean(env.GOOGLE_OAUTH_CLIENT_ID?.trim() && env.GOOGLE_OAUTH_CLIENT_SECRET?.trim()),
  });
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
