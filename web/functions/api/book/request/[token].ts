import { corsJson } from '../../../_lib/data';
import { kvGet, storageReadPaused } from '../../../_lib/kv-json';
import type { SettingsEnv } from '../../../_lib/kv';
import { loadHolds } from '../../../_lib/hold-store';
import { getAllReservations } from '../../../_lib/reservations-store';
import { denverToday } from '../../../../src/lib/market/dates';
import {
  holdLine,
  requestHouseLine,
  requestStatusLine,
  requestView,
  type RequestStatusInput,
} from '../../../../src/lib/request-status';

/** The saved decline list key. The same one the decline route writes. */
const DECLINE_KEY = 'bookingDeclines';

type SavedRequest = RequestStatusInput & {
  id?: unknown;
  statusToken?: unknown;
};

type SavedDecline = { id?: unknown; reason?: unknown; at?: unknown };

/**
 * One direct request, for the guest who sent it. The token in the path is the whole credential, and
 * it is the only thing this route accepts: there is no way to read someone else's request.
 *
 * It returns the dates, the party, and the state. It does not return the guest's name, email, phone,
 * note, or any price, so a forwarded or leaked link exposes nothing that was not already on the
 * booking page. A token that matches no request reads as invalid rather than empty.
 */
export const onRequestGet: PagesFunction<SettingsEnv> = async ({ request, env, params }) => {
  const token = typeof params.token === 'string' ? params.token : '';
  if (!/^[a-f0-9]{32}$/.test(token)) return corsJson(request, { error: 'This link is not valid.' }, 404);

  let requests: SavedRequest[];
  let stays;
  let declines: SavedDecline[];
  let holds;
  let cancelledNotes: string[] = [];
  try {
    requests = await kvGet<SavedRequest[]>(env, 'booking-requests', []);
    stays = await getAllReservations(env);
    declines = await kvGet<SavedDecline[]>(env, DECLINE_KEY, []);
    holds = await loadHolds(env);
    /*
     * `getAllReservations` deliberately leaves cancelled stays out, which is right for a calendar
     * but wrong here: a stay that was accepted and then called off has to read as cancelled, not as
     * an unanswered request. The cancellation lives on the raw row and on the override map, so those
     * two are read directly and only the note is kept.
     */
    const raw = await kvGet<Array<{ note?: unknown; status?: unknown }>>(env, 'reservations', []);
    const overrides = await kvGet<Record<string, { note?: unknown; status?: unknown }>>(env, 'reservationOverrides', {});
    for (const row of raw) {
      if (row && typeof row.note === 'string' && row.status === 'cancelled') cancelledNotes.push(row.note);
    }
    for (const row of Object.values(overrides)) {
      if (row && typeof row.note === 'string' && row.status === 'cancelled') cancelledNotes.push(row.note);
    }
  } catch (err) {
    if (storageReadPaused(err)) {
      return corsJson(
        request,
        {
          error: 'Your request could not be read just now. Nothing was written. Please try again.',
          storageReads: 'paused',
        },
        503,
      );
    }
    const message = err instanceof Error ? err.message : 'The request could not be read.';
    return corsJson(request, { error: message }, 500);
  }

  const saved = requests.find((row) => row.statusToken === token);
  if (!saved) return corsJson(request, { error: 'This link is not valid.' }, 404);

  const id = typeof saved.id === 'string' ? saved.id : '';
  if (!id) return corsJson(request, { error: 'This link is not valid.' }, 404);

  const decline = declines.find((row) => row.id === id) ?? null;
  const hold = holds.find((row) => row.requestId === id) ?? null;

  const view = requestView(saved, {
    requestId: id,
    // A cancelled stay is not in the active list, so it is added back as a cancelled row. Only its
    // note is used to match, and only its status is read.
    stays: [
      ...stays.map((stay) => ({
        note: stay.note ?? null,
        propertyId: stay.propertyId,
        checkIn: stay.checkIn,
        checkOut: stay.checkOut,
        status: stay.status,
      })),
      ...cancelledNotes.map((note) => ({ note, status: 'cancelled' })),
    ],
    decline,
    // A released hold has done its job, so it must not read as a live hold to the guest either.
    hold: hold ? { expiresAt: hold.expiresAt, released: hold.released === true } : null,
    asOf: denverToday(),
    // The real instant, so a hold that ran out earlier today does not read as still running.
    now: new Date().toISOString(),
  });
  if (!view) return corsJson(request, { error: 'This request does not name dates we can show.' }, 404);

  return corsJson(
    request,
    {
      status: view.status,
      houses: view.houses,
      houseLine: requestHouseLine(view.houses),
      checkIn: view.checkIn,
      checkOut: view.checkOut,
      nights: view.nights,
      ...(view.guests !== undefined ? { guests: view.guests } : {}),
      ...(view.children !== undefined ? { children: view.children } : {}),
      ...(view.heldUntil ? { heldUntil: view.heldUntil } : {}),
      ...(view.reason ? { reason: view.reason } : {}),
      ...(view.answeredAt ? { answeredAt: view.answeredAt } : {}),
      line: requestStatusLine(view),
      hold: holdLine(view),
      storageReads: 'ok',
    },
    200,
    { 'Cache-Control': 'no-store' },
  );
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
