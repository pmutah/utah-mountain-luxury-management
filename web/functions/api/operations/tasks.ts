import { hostDenied, hostOnly } from '../../_lib/auth';
import { corsJson } from '../../_lib/data';
import { readJsonBody } from '../../_lib/json-body';
import { loadOpsTasks, createOpsTask, updateOpsTask } from '../../_lib/operations-store';
import { readOrRefuse } from '../../_lib/read-guard';
import type { AgentEnv } from '../../_lib/agent/types';

export const onRequestGet: PagesFunction<AgentEnv> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  const read = await readOrRefuse(request, () => loadOpsTasks(env), 'Saved operations tasks');
  if (!read.ok) return read.response;
  return corsJson(request, { tasks: read.value });
};

export const onRequestPost: PagesFunction<AgentEnv> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  const parsed = await readJsonBody<{
    propertyId: 'ranch' | 'lindon' | 'river';
    dueDate: string;
    type?: 'cleaning' | 'maintenance' | 'other';
    reservationId?: string;
    notes?: string;
  }>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  const read = await readOrRefuse(
    request,
    () =>
      createOpsTask(env, {
        propertyId: body.propertyId,
        dueDate: body.dueDate,
        type: body.type ?? 'cleaning',
        reservationId: body.reservationId,
        notes: body.notes,
      }),
    'Saved operations tasks',
  );
  if (!read.ok) return read.response;
  return corsJson(request, read.value, 201);
};

export const onRequestPatch: PagesFunction<AgentEnv> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  const body = (await request.json()) as { id: string; status?: string; notes?: string };
  if (!body.id) return corsJson(request, { error: 'id required' }, 400);
  const read = await readOrRefuse(
    request,
    () =>
      updateOpsTask(env, body.id, {
        status: body.status as 'pending' | 'done' | 'cancelled' | undefined,
        notes: body.notes,
      }),
    'Saved operations tasks',
  );
  if (!read.ok) return read.response;
  if (!read.value) return corsJson(request, { error: 'Not found' }, 404);
  return corsJson(request, read.value);
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
