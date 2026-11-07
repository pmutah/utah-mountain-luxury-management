import { hostDenied, hostOnly } from '../../_lib/auth';
import { corsJson } from '../../_lib/data';
import { applySharedWork } from '../../_lib/agent-work';
import { callingAgent } from '../../_lib/muse/auth';
import { readOrRefuse } from '../../_lib/read-guard';
import type { AgentEnv } from '../../_lib/agent/types';

export const onRequestGet: PagesFunction<AgentEnv> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  const sinceDays = Math.min(45, Math.max(1, Number(new URL(request.url).searchParams.get('sinceDays')) || 14));
  const read = await readOrRefuse(
    request,
    () => applySharedWork(env, callingAgent(request, env), { action: 'list', sinceDays }),
    'The shared job list',
  );
  if (!read.ok) return read.response;
  return corsJson(request, read.value);
};

export const onRequestPost: PagesFunction<AgentEnv> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return corsJson(request, { error: 'Invalid JSON body.' }, 400);
  }
  const read = await readOrRefuse(
    request,
    () => applySharedWork(env, callingAgent(request, env), body),
    'The shared job list',
  );
  if (!read.ok) return read.response;
  if (read.value.error) return corsJson(request, read.value, 400);
  return corsJson(request, read.value);
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
