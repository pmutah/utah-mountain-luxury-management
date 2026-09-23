import { runAgentChat } from '../../_lib/agent/run-agent';
import type { AgentEnv } from '../../_lib/agent/types';
import type { ConstructionEnv } from '../../_lib/construction/types';
import { corsJson } from '../../_lib/data';
import { isMuseAuthorized, museBotSecret } from '../../_lib/muse/auth';

type MusePagesEnv = AgentEnv & ConstructionEnv;

/**
 * One plain-language request. The agent runs the tools and returns what it did.
 * Body: { message: string, runId?: string }
 */
export const onRequestPost: PagesFunction<MusePagesEnv> = async ({ request, env }) => {
  if (!museBotSecret(env)) return corsJson(request, { error: 'Muse bot is not configured.' }, 503);
  if (!isMuseAuthorized(request, env)) return corsJson(request, { error: 'Unauthorized' }, 401);

  let body: { message?: string; runId?: string; sessionId?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return corsJson(request, { error: 'Invalid JSON body.' }, 400);
  }

  const message = String(body.message ?? '').trim();
  if (!message) return corsJson(request, { error: 'message is required.' }, 400);
  if (!env.GEMINI_API_KEY?.trim()) {
    return corsJson(request, { error: 'GEMINI_API_KEY not configured' }, 503);
  }

  const runId = String(body.runId ?? body.sessionId ?? '').trim() || undefined;
  try {
    const result = await runAgentChat(
      env,
      `This request arrived on the API. Do the work with tools. Do not tell the caller to open a screen, log in, or click.\n\n${message}`,
      runId,
    );
    return corsJson(request, {
      ok: true,
      text: result.reply,
      runId: result.sessionId,
      steps: result.toolSteps,
    });
  } catch (e) {
    return corsJson(request, { error: e instanceof Error ? e.message : String(e) }, 502);
  }
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
