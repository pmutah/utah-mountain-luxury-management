import { hostDenied, hostOnly } from '../../_lib/auth';
import { corsJson } from '../../_lib/data';
import { readJsonBody } from '../../_lib/json-body';
import { updateReservation, updateReservationStatus, getAllReservations } from '../../_lib/reservations-store';
import { readOrRefuse } from '../../_lib/read-guard';
import type { AgentEnv, ReservationRecord, ReservationStatus } from '../../_lib/agent/types';

export const onRequestPatch: PagesFunction<AgentEnv> = async ({ request, env, params }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  const id = params.id as string;
  const parsed = await readJsonBody<{
    status?: ReservationStatus;
    note?: string;
    payout?: number;
    guestName?: string;
    guestEmail?: string;
    guestPhone?: string;
    confirmationCode?: string;
    source?: string;
  }>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  const patch: Partial<ReservationRecord> = {};
  if (body.note !== undefined) patch.note = body.note;
  if (body.guestName !== undefined) patch.guestName = body.guestName;
  if (body.guestEmail !== undefined) patch.guestEmail = body.guestEmail.trim();
  if (body.guestPhone !== undefined) patch.guestPhone = body.guestPhone.trim();
  if (body.confirmationCode !== undefined) patch.confirmationCode = body.confirmationCode.trim();
  if (body.source !== undefined) {
    const source = String(body.source).trim();
    if (!source) return corsJson(request, { error: 'source must be a non-empty string' }, 400);
    patch.source = source;
  }
  if (body.payout !== undefined) {
    const payout = Number(body.payout);
    if (!Number.isFinite(payout) || payout < 0) {
      return corsJson(request, { error: 'payout must be a number ≥ 0' }, 400);
    }
    patch.payout = payout;
  }

  if (body.status) {
    const read = await readOrRefuse(
      request,
      () => updateReservationStatus(env, id, body.status!, patch),
      'Saved bookings',
    );
    if (!read.ok) return read.response;
    if (!read.value) return corsJson(request, { error: 'Not found' }, 404);
    return corsJson(request, read.value);
  }

  if (Object.keys(patch).length === 0) {
    return corsJson(request, { error: 'Nothing to update' }, 400);
  }

  const read = await readOrRefuse(request, () => updateReservation(env, id, patch), 'Saved bookings');
  if (!read.ok) return read.response;
  const updated = read.value;
  if (!updated) return corsJson(request, { error: 'Not found' }, 404);
  return corsJson(request, updated);
};

export const onRequestGet: PagesFunction<AgentEnv> = async ({ request, env, params }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  const id = params.id as string;
  const read = await readOrRefuse(request, () => getAllReservations(env), 'Saved bookings');
  if (!read.ok) return read.response;
  const r = read.value.find((x) => x.id === id);
  if (!r) return corsJson(request, { error: 'Not found' }, 404);
  return corsJson(request, r);
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
