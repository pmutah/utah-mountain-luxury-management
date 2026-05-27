import { corsJson } from '../../_lib/data';
import { runAgentChat } from '../../_lib/agent/run-agent';
import type { AgentEnv } from '../../_lib/agent/types';

export const onRequestPost: PagesFunction<AgentEnv> = async ({ request, env }) => {
  const apiKey = env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return corsJson(request, { error: 'GEMINI_API_KEY not configured' }, 503);
  }

  let body: {
    message?: string;
    sessionId?: string;
    context?: { month?: string; activeTab?: string };
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return corsJson(request, { error: 'Invalid JSON' }, 400);
  }

  if (!body.message?.trim()) {
    return corsJson(request, { error: 'message required' }, 400);
  }

  try {
    const result = await runAgentChat(env, body.message.trim(), body.sessionId, body.context ?? {});
    return corsJson(request, result);
  } catch (e) {
    return corsJson(
      request,
      { error: e instanceof Error ? e.message : 'Agent failed' },
      422,
    );
  }
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
