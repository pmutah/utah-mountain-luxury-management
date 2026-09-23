import { corsJson } from '../../_lib/data';
import { applySharedWork } from '../../_lib/agent-work';
import { callingAgent } from '../../_lib/muse/auth';
import type { AgentEnv } from '../../_lib/agent/types';

export const onRequestGet: PagesFunction<AgentEnv> = async ({ request, env }) => {
  const sinceDays = Math.min(45, Math.max(1, Number(new URL(request.url).searchParams.get('sinceDays')) || 14));
  return corsJson(request, await applySharedWork(env, callingAgent(request, env), { action: 'list', sinceDays }));
};

export const onRequestPost: PagesFunction<AgentEnv> = async ({ request, env }) => {
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return corsJson(request, { error: 'Invalid JSON body.' }, 400);
  }
  const result = await applySharedWork(env, callingAgent(request, env), body);
  if (result.error) return corsJson(request, result, 400);
  return corsJson(request, result);
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
