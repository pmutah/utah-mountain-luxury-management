import { corsJson } from '../../_lib/data';
import { updateReservationStatus, getAllReservations } from '../../_lib/reservations-store';
import type { AgentEnv } from '../../_lib/agent/types';

export const onRequestPatch: PagesFunction<AgentEnv> = async ({ request, env, params }) => {
  const id = params.id as string;
  const body = (await request.json()) as { status?: string; note?: string };
  if (!body.status) return corsJson(request, { error: 'status required' }, 400);

  const updated = await updateReservationStatus(
    env,
    id,
    body.status as 'confirmed' | 'cancelled' | 'blocked' | 'pending',
    body.note ? { note: body.note } : undefined,
  );
  if (!updated) return corsJson(request, { error: 'Not found' }, 404);
  return corsJson(request, updated);
};

export const onRequestGet: PagesFunction<AgentEnv> = async ({ request, env, params }) => {
  const id = params.id as string;
  const all = await getAllReservations(env);
  const r = all.find((x) => x.id === id);
  if (!r) return corsJson(request, { error: 'Not found' }, 404);
  return corsJson(request, r);
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
