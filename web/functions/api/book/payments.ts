import { hostDenied, hostOnly } from '../../_lib/auth';
import { corsJson } from '../../_lib/data';
import { findReservationAnyStatus, updateReservation } from '../../_lib/reservations-store';
import { readOrRefuse } from '../../_lib/read-guard';
import { isDirectSource, isRealDay, parseAmount, paymentLedger } from '../../../src/lib/payment-ledger';
import type { AgentEnv, PaymentRow } from '../../_lib/agent/types';

/**
 * Record money received against a direct booking, and get the balance back.
 *
 * The booking site could quote a stay and record it, and `guestTotal` said what the guest was quoted — but
 * nothing recorded money arriving. A confirmed direct booking could not answer "what is still owed", which is
 * the one question a host asks about a booking they took themselves.
 *
 * Rules that keep this a record and not a guess:
 *
 *   - **Append, never overwrite.** A payment is a new row. A refund is a negative row, so the payment it
 *     reverses stays visible and the sum is the truth. Editing a past payment in place would erase history.
 *   - **Host only, and it fails closed.**
 *   - **Direct bookings only.** Airbnb, VRBO, and Hospitable collect from the guest and remit a payout; a
 *     payment typed against one of those would double-count money that is already in `payout`.
 *   - **It mails nobody.** Recording a payment is bookkeeping. Telling the guest is a separate, deliberate act.
 *
 * GET returns the ledger for one booking: what was quoted, what arrived, what is outstanding. DELETE removes
 * one payment row by id, for a typo made a second ago — and returns the ledger again so the host sees the
 * balance move.
 */

type Env = AgentEnv & { DASHBOARD_PASSWORD?: string };

type Body = {
  id?: unknown;
  payment?: unknown;
  paymentId?: unknown;
};

/** A payment the caller wants to add, after every field is checked. */
function readPayment(raw: unknown): { ok: true; payment: PaymentRow } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'A payment object is required.' };
  const input = raw as Record<string, unknown>;

  const amount = parseAmount(input.amount);
  if (amount === null) return { ok: false, error: 'The amount is not a number.' };
  if (amount === 0) return { ok: false, error: 'A payment of zero records nothing.' };

  if (!isRealDay(input.receivedOn)) {
    return { ok: false, error: 'The date the money arrived must be a real calendar day, like 2026-11-09.' };
  }

  const id = typeof input.id === 'string' && input.id.trim() ? input.id.trim() : `pay-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const text = (value: unknown): string | undefined =>
    typeof value === 'string' && value.trim() ? value.trim() : undefined;

  return {
    ok: true,
    payment: {
      id,
      amount,
      receivedOn: input.receivedOn,
      ...(text(input.method) ? { method: text(input.method) } : {}),
      ...(text(input.reference) ? { reference: text(input.reference) } : {}),
      ...(text(input.note) ? { note: text(input.note) } : {}),
    },
  };
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);

  const id = new URL(request.url).searchParams.get('id')?.trim() ?? '';
  if (!id) return corsJson(request, { error: 'A booking id is required.' }, 400);

  const read = await readOrRefuse(request, () => findReservationAnyStatus(env, id), 'Saved bookings');
  if (!read.ok) return read.response;

  const stay = read.value;
  if (!stay) return corsJson(request, { error: 'That booking is not on the calendar.' }, 404);

  const ledger = paymentLedger({
    source: stay.source,
    guestTotal: stay.guestTotal,
    payments: stay.payments,
  });

  return corsJson(
    request,
    {
      id: stay.id,
      propertyId: stay.propertyId,
      checkIn: stay.checkIn,
      checkOut: stay.checkOut,
      source: stay.source,
      status: stay.status ?? 'confirmed',
      direct: isDirectSource(stay.source),
      ...ledger,
    },
    200,
    { 'Cache-Control': 'no-store' },
  );
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return corsJson(request, { error: 'That could not be read as JSON.' }, 400);
  }

  const id = typeof body.id === 'string' ? body.id.trim() : '';
  if (!id) return corsJson(request, { error: 'A booking id is required.' }, 400);

  const parsed = readPayment(body.payment);
  if (!parsed.ok) return corsJson(request, { error: parsed.error }, 400);

  /*
   * The booking is read first, not trusted from the caller: the source and the total decide whether a balance
   * exists at all, and a request body could otherwise name a total the guest never agreed to.
   */
  const read = await readOrRefuse(request, () => findReservationAnyStatus(env, id), 'Saved bookings');
  if (!read.ok) return read.response;

  const stay = read.value;
  if (!stay) return corsJson(request, { error: 'That booking is not on the calendar.' }, 404);
  if (stay.status === 'cancelled' && parsed.payment.amount > 0) {
    /*
     * A cancelled stay can still take money **back** — a refund against a booking somebody already paid is a
     * real obligation, and the cancelled row is kept in the store for exactly this. What it cannot take is a
     * new charge: the nights are gone, so money arriving for them would be recorded against a stay nobody has.
     */
    return corsJson(
      request,
      { error: 'That booking is cancelled, so it cannot take a new payment. A refund is recorded as a negative amount.' },
      409,
    );
  }
  if (!isDirectSource(stay.source)) {
    return corsJson(
      request,
      {
        error: `That booking came through ${stay.source}. The platform collects from the guest and pays out, so a payment here would count the same money twice.`,
      },
      409,
    );
  }
  if (!Number.isFinite(stay.guestTotal) || (stay.guestTotal ?? 0) <= 0) {
    // Without a quoted total there is no balance to pay down, and a payment would sit against nothing.
    return corsJson(
      request,
      { error: 'That booking has no guest total, so there is no balance for a payment to reduce. Set the total first.' },
      409,
    );
  }

  const existing = stay.payments ?? [];
  if (existing.some((row) => row.id === parsed.payment.id)) {
    // Idempotent by id, so a retried submit does not record the same money twice.
    const ledger = paymentLedger({ source: stay.source, guestTotal: stay.guestTotal, payments: existing });
    return corsJson(request, { ok: true, id, duplicate: true, ...ledger }, 200, { 'Cache-Control': 'no-store' });
  }

  const next = [...existing, parsed.payment];
  const saved = await updateReservation(env, id, { payments: next }).catch((err: unknown) => {
    if (err instanceof Error) return null;
    throw err;
  });
  if (!saved) return corsJson(request, { error: 'The payment could not be saved. Nothing was recorded.' }, 503);

  const ledger = paymentLedger({ source: stay.source, guestTotal: stay.guestTotal, payments: next });
  return corsJson(
    request,
    {
      ok: true,
      id,
      payment: parsed.payment,
      sent: 0,
      note: 'Recorded. Nothing was sent to the guest.',
      ...ledger,
    },
    201,
    { 'Cache-Control': 'no-store' },
  );
};

export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);

  const url = new URL(request.url);
  const id = url.searchParams.get('id')?.trim() ?? '';
  const paymentId = url.searchParams.get('paymentId')?.trim() ?? '';
  if (!id) return corsJson(request, { error: 'A booking id is required.' }, 400);
  if (!paymentId) return corsJson(request, { error: 'A payment id is required.' }, 400);

  const read = await readOrRefuse(request, () => findReservationAnyStatus(env, id), 'Saved bookings');
  if (!read.ok) return read.response;

  const stay = read.value;
  if (!stay) return corsJson(request, { error: 'That booking is not on the calendar.' }, 404);

  const existing = stay.payments ?? [];
  const next = existing.filter((row) => row.id !== paymentId);
  if (next.length === existing.length) {
    return corsJson(request, { error: 'There is no payment with that id on this booking.' }, 404);
  }

  const saved = await updateReservation(env, id, { payments: next }).catch(() => null);
  if (!saved) return corsJson(request, { error: 'The correction could not be saved. Nothing was changed.' }, 503);

  const ledger = paymentLedger({ source: stay.source, guestTotal: stay.guestTotal, payments: next });
  return corsJson(
    request,
    {
      ok: true,
      id,
      removed: paymentId,
      note: 'Removed. A refund should be a negative payment instead, so the record of what arrived is kept.',
      ...ledger,
    },
    200,
    { 'Cache-Control': 'no-store' },
  );
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
