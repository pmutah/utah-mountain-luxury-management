import { corsJson } from '../../_lib/data';
import { loadOpsTasks, createOpsTask, updateOpsTask } from '../../_lib/operations-store';
import type { AgentEnv } from '../../_lib/agent/types';

export const onRequestGet: PagesFunction<AgentEnv> = async ({ request, env }) => {
  const tasks = await loadOpsTasks(env);
  return corsJson(request, { tasks });
};

export const onRequestPost: PagesFunction<AgentEnv> = async ({ request, env }) => {
  const body = (await request.json()) as {
    propertyId: 'ranch' | 'lindon';
    dueDate: string;
    type?: 'cleaning' | 'maintenance' | 'other';
    reservationId?: string;
    notes?: string;
  };
  const task = await createOpsTask(env, {
    propertyId: body.propertyId,
    dueDate: body.dueDate,
    type: body.type ?? 'cleaning',
    reservationId: body.reservationId,
    notes: body.notes,
  });
  return corsJson(request, task, 201);
};

export const onRequestPatch: PagesFunction<AgentEnv> = async ({ request, env }) => {
  const body = (await request.json()) as { id: string; status?: string; notes?: string };
  if (!body.id) return corsJson(request, { error: 'id required' }, 400);
  const updated = await updateOpsTask(env, body.id, {
    status: body.status as 'pending' | 'done' | 'cancelled' | undefined,
    notes: body.notes,
  });
  if (!updated) return corsJson(request, { error: 'Not found' }, 404);
  return corsJson(request, updated);
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
