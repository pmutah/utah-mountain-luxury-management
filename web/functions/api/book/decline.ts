import { corsJson } from '../../_lib/data';
import { hostDenied, hostOnly } from '../../_lib/auth';
import { kvGet, kvPut, storageReadPaused } from '../../_lib/kv-json';
import { getAllReservations } from '../../_lib/reservations-store';
import { releaseHoldsForRequest } from '../../_lib/hold-store';
import { forgetCalendar } from '../../_lib/public-calendar-cache';
import { gmailSend } from '../../_lib/gmail-store';
import { canDecline, declineHouses, declineLine, declineRecord, guestDeclineMail, isDeclineReason } from '../../../src/lib/booking-decline';
import type { HouseId } from '../../../src/lib/market/types';

/** The public house-page link for a stay. Built here so the server never imports a browser module. */
function retryLink(house: HouseId, checkIn: string, checkOut: string, guests?: number): string {
  const query = new URLSearchParams({ in: checkIn, out: checkOut });
  if (typeof guests === 'number' && Number.isInteger(guests) && guests >= 1) query.set('guests', String(guests));
  return `/houses/${house}?${query.toString()}`;
}
import type { BookingRequestRow } from '../../../src/lib/booking-inbox';
import type { SettingsEnv } from '../../_lib/kv';

type Env = SettingsEnv & { DASHBOARD_PASSWORD?: string };

type StoredDecline = { id: string; reason: string; note?: string; at: string };

const DECLINE_KEY = 'bookingDeclines';

/**
 * Decline a saved request with a reason. It records the decision so the inbox shows it, lets the hold
 * go, and tells the guest the dates are not available. It books nothing and touches no expense.
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  let body: { id?: unknown; reason?: unknown; note?: unknown; notify?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return corsJson(request, { error: 'Invalid JSON' }, 400);
  }
  const id = typeof body.id === 'string' ? body.id.trim() : '';
  if (!id) return corsJson(request, { error: 'A request id is required.' }, 400);
  if (!isDeclineReason(body.reason)) {
    return corsJson(
      request,
      { error: 'Choose a reason: dates-taken, too-many-guests, minimum-stay, maintenance, owner-stay, or other.' },
      400,
    );
  }
  const note = typeof body.note === 'string' ? body.note : undefined;

  let requests: BookingRequestRow[];
  let stays;
  let declines: StoredDecline[];
  try {
    requests = await kvGet<BookingRequestRow[]>(env, 'booking-requests', []);
    stays = await getAllReservations(env);
    declines = await kvGet<StoredDecline[]>(env, DECLINE_KEY, []);
  } catch (err) {
    if (storageReadPaused(err)) {
      return corsJson(request, { error: 'Saved requests could not be read. Nothing was declined.' }, 503);
    }
    const message = err instanceof Error ? err.message : 'Decline failed';
    return corsJson(request, { error: message }, 500);
  }

  const saved = requests.find((row) => row.id === id) ?? null;
  const accepted = Boolean(stays.some((stay) => (stay.note ?? '').includes(`Direct request ${id}.`)));
  const alreadyDeclined = declines.some((row) => row.id === id);
  const check = canDecline({ request: saved, accepted, alreadyDeclined });
  if (!check.ok) return corsJson(request, { error: check.reason }, 409);

  const record = declineRecord(body.reason, note);
  try {
    await kvPut(env, DECLINE_KEY, [...declines.filter((row) => row.id !== id), { id, ...record }].slice(-200));
  } catch (err) {
    if (storageReadPaused(err)) {
      return corsJson(request, { error: 'The decline could not be saved.' }, 503);
    }
    throw err;
  }
  // The hold has no reason to keep blocking once the host has said no.
  await releaseHoldsForRequest(env, id).catch(() => 0);
  /*
   * A decline frees the nights it was holding, so the cached public calendar is now wrong in the other direction: those
   * dates should read free again. Cleared here for the same reason it is cleared on accept.
   */
  forgetCalendar();

  // Tell the guest, unless the host asked to keep it quiet. A failed send leaves the decline saved.
  const houses = declineHouses(saved!);
  const retryHouse = houses[0];
  const retryHref =
    retryHouse && saved!.checkIn && saved!.checkOut
      ? retryLink(retryHouse, saved!.checkIn, saved!.checkOut, saved!.guests)
      : null;
  const to = (saved!.email ?? '').trim();
  const shouldNotify = body.notify !== false;
  const mail = guestDeclineMail({
    guestName: saved!.name ?? 'Guest',
    houses: houses.map((house) => (house === 'river' ? 'The River House' : house === 'ranch' ? 'The Ranch House' : 'The Lindon House')),
    checkIn: saved!.checkIn ?? '',
    checkOut: saved!.checkOut ?? '',
    reason: body.reason,
    ...(record.note ? { note: record.note } : {}),
    // A declined guest gets a live path back to the booking page with the dates and party filled in,
    // rather than only an email address to reply to.
    ...(retryHref
      ? { retryHref, origin: new URL(request.url).origin }
      : {}),
  });
  const sent =
    shouldNotify && to.includes('@')
      ? await gmailSend(env, to, mail.subject, mail.body).catch((err) => ({
          error: err instanceof Error ? err.message : 'Guest mail failed',
        }))
      : shouldNotify
        ? { error: 'This request has no guest email, so no note was sent.' }
        : { error: undefined };

  return corsJson(
    request,
    {
      ok: true,
      line: declineLine(record),
      reason: record.reason,
      guestEmailed: shouldNotify && !sent.error && Boolean(to.includes('@')),
      guestEmailError: sent.error ?? null,
    },
    200,
    { 'Cache-Control': 'no-store' },
  );
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
