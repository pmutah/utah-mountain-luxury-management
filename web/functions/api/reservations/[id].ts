import { corsJson } from '../../_lib/data';
import { updateReservation, updateReservationStatus, getAllReservations } from '../../_lib/reservations-store';
import type { AgentEnv, ReservationRecord, ReservationStatus } from '../../_lib/agent/types';

export const onRequestPatch: PagesFunction<AgentEnv> = async ({ request, env, params }) => {
  const id = params.id as string;
  const body = (await request.json()) as {
    status?: ReservationStatus;
    note?: string;
    payout?: number;
    guestName?: string;
  };

  const patch: Partial<ReservationRecord> = {};
  if (body.note !== undefined) patch.note = body.note;
  if (body.guestName !== undefined) patch.guestName = body.guestName;
  if (body.payout !== undefined) {
    const payout = Number(body.payout);
    if (!Number.isFinite(payout) || payout < 0) {
      return corsJson(request, { error: 'payout must be a number ≥ 0' }, 400);
    }
    patch.payout = payout;
  }

  if (body.status) {
    const updated = await updateReservationStatus(env, id, body.status, patch);
    if (!updated) return corsJson(request, { error: 'Not found' }, 404);
    return corsJson(request, updated);
  }

  if (Object.keys(patch).length === 0) {
    return corsJson(request, { error: 'status, payout, guestName, or note required' }, 400);
  }

  const updated = await updateReservation(env, id, patch);
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
