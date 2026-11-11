import { hostDenied, hostOnly } from '../../_lib/auth';
import { corsJson } from '../../_lib/data';
import { readJsonBody } from '../../_lib/json-body';
import { updateReservation, updateReservationStatus, getAllReservations } from '../../_lib/reservations-store';
import { readOrRefuse } from '../../_lib/read-guard';
import type { AgentEnv, ReservationRecord, ReservationStatus } from '../../_lib/agent/types';
import { refuseReadOnly, mayReadHouse, resolveCaller } from '../../_lib/roles';
import { audit, auditActorFor } from '../../_lib/platform/audit-store';

export const onRequestPatch: PagesFunction<AgentEnv> = async ({ request, env, params }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  const readOnly = refuseReadOnly(request, env, corsJson);
  if (readOnly) return readOnly;
  const id = params.id as string;
  const parsed = await readJsonBody<{
    status?: ReservationStatus;
    note?: string;
    payout?: number;
    /**
     * Money a cancelled stay still earned, when the channel kept a cancellation fee. Its own field, never `payout`,
     * because on a cancelled row `payout` is the figure the stay would have paid and reading it would invent money.
     */
    cancellationIncome?: number;
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
  /*
   * A cancellation fee is money that arrived, so it is checked the same way a payment is: a real, positive figure.
   * A zero or negative value records no fee rather than a fee of nothing, and a blank one is refused instead of
   * being read as `0` — `Number('')` is `0`, which would silently clear a fee that is already on the row.
   */
  if (body.cancellationIncome !== undefined) {
    if (typeof body.cancellationIncome !== 'number' || !Number.isFinite(body.cancellationIncome)) {
      return corsJson(request, { error: 'cancellationIncome must be a number' }, 400);
    }
    if (body.cancellationIncome <= 0) {
      return corsJson(request, { error: 'cancellationIncome must be greater than 0' }, 400);
    }
    patch.cancellationIncome = Math.round(body.cancellationIncome * 100) / 100;
  }

  if (body.status) {
    const read = await readOrRefuse(
      request,
      () => updateReservationStatus(env, id, body.status!, patch),
      'Saved bookings',
    );
    if (!read.ok) return read.response;
    if (!read.value) return corsJson(request, { error: 'Not found' }, 404);
    const logged = await audit(env, {
      actor: auditActorFor(request, env),
      action: 'reservation.status',
      target: id,
      note: `Status is now ${body.status}.`,
    });
    return corsJson(request, { ...read.value, ...(logged.ok ? {} : { auditFailed: logged.reason }) });
  }

  if (Object.keys(patch).length === 0) {
    return corsJson(request, { error: 'Nothing to update' }, 400);
  }

  const read = await readOrRefuse(request, () => updateReservation(env, id, patch), 'Saved bookings');
  if (!read.ok) return read.response;
  const updated = read.value;
  if (!updated) return corsJson(request, { error: 'Not found' }, 404);
  const logged = await audit(env, {
    actor: auditActorFor(request, env),
    action: 'reservation.update',
    target: id,
    note: `Fields changed: ${Object.keys(patch).slice(0, 8).join(', ')}.`,
  });
  return corsJson(request, { ...updated, ...(logged.ok ? {} : { auditFailed: logged.reason }) });
};

export const onRequestGet: PagesFunction<AgentEnv> = async ({ request, env, params }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  const id = params.id as string;
  const read = await readOrRefuse(request, () => getAllReservations(env), 'Saved bookings');
  if (!read.ok) return read.response;
  const r = read.value.find((x) => x.id === id);
  /*
   * The list route strips Lindon, so fetching a Lindon booking **by id** was the way around it: an owner who knew or guessed an id got
   * the whole row, guest name included. The check is `mayReadHouse`, the same one the rest of the codebase asks, so the two routes cannot
   * disagree.
   *
   * A house the caller may not read is answered as **not found**, not as forbidden. A 403 would confirm the row exists, which tells an
   * owner there are Lindon bookings with that id.
   */
  const caller = resolveCaller(request, env);
  if (caller.kind === 'denied') return hostDenied(request, env);
  if (!r || (r.propertyId && !mayReadHouse(caller.role, r.propertyId))) {
    return corsJson(request, { error: 'Not found' }, 404);
  }
  return corsJson(request, r);
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
