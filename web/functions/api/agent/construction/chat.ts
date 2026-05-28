import { corsJson } from '../../../_lib/data';
import { runConstructionAgentChat } from '../../../_lib/agent/construction/run-agent';
import type { ConstructionEnv } from '../../../_lib/construction/types';

export const onRequestPost: PagesFunction<ConstructionEnv> = async ({ request, env }) => {
  const apiKey = env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return corsJson(request, { error: 'GEMINI_API_KEY not configured' }, 503);
  }

  let body: { message?: string; sessionId?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return corsJson(request, { error: 'Invalid JSON' }, 400);
  }

  if (!body.message?.trim()) {
    return corsJson(request, { error: 'message required' }, 400);
  }

  try {
    const result = await runConstructionAgentChat(env, body.message.trim(), body.sessionId);
    return corsJson(request, result);
  } catch (e) {
    return corsJson(
      request,
      { error: e instanceof Error ? e.message : 'Construction agent failed' },
      422,
    );
  }
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
