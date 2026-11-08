import { corsJson } from '../../_lib/data';
import { hostDenied, hostOnly } from '../../_lib/auth';
import { kvGet, kvPut, storageReadPaused } from '../../_lib/kv-json';
import { getAllReservations } from '../../_lib/reservations-store';
import { loadHolds } from '../../_lib/hold-store';
import type { BookingRequestRow } from '../../../src/lib/booking-inbox';
import type { SettingsEnv } from '../../_lib/kv';

type Env = SettingsEnv & { DASHBOARD_PASSWORD?: string };

/**
 * Discard a saved direct request, without answering the guest.
 *
 * The inbox had only two outcomes: accept, or decline. Decline **emails the guest**, which is right for
 * real demand and wrong for everything else — a duplicate, a test, a probe, or a request the host already
 * answered by phone. There was no way to clear those, so junk sat in the inbox forever and a host reading
 * the list could not tell it from live demand. On 2026-11-08 twelve agent test requests were stuck there
 * for exactly this reason.
 *
 * Rules that keep this from being a way to lose real business:
 *   - host only, and it fails closed;
 *   - refused for a request that became a booking, so the audit trail cannot be broken;
 *   - refused while the 30-minute hold is still live, because discarding it would free nights a guest is
 *     actively asking for — decline or wait out the hold instead;
 *   - nothing is sent, so an address is never mailed a decision nobody made.
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);

  let body: { id?: unknown; reason?: unknown };
  try {
    body = (await request.json()) as { id?: unknown; reason?: unknown };
  } catch {
    return corsJson(request, { error: 'That request could not be read.' }, 400);
  }
  const id = typeof body.id === 'string' ? body.id.trim() : '';
  if (!id) return corsJson(request, { error: 'A request id is required.' }, 400);

  let rows: BookingRequestRow[];
  let stays;
  try {
    [rows, stays] = await Promise.all([
      kvGet<BookingRequestRow[]>(env, 'booking-requests', []),
      getAllReservations(env),
    ]);
  } catch (err) {
    if (storageReadPaused(err)) {
      return corsJson(request, { error: 'Saved requests could not be read. Nothing was discarded.' }, 503);
    }
    throw err;
  }

  const row = rows.find((candidate) => candidate.id === id);
  if (!row) return corsJson(request, { error: 'That request is not on the list.' }, 404);

  // A request that became a stay is part of the record now. Deleting it would break the link the guest's
  // own page and the confirmation email both rely on.
  const becameBooking = stays.some((stay) => String(stay.note ?? '').includes(id));
  if (becameBooking) {
    return corsJson(
      request,
      { error: 'That request is a booking. It cannot be discarded — the guest has a confirmation for it.' },
      409,
    );
  }

  /*
   * The 30-minute hold lives in its own store, not on the request row — checking the row would always
   * read "no hold" and would free nights a guest is still actively asking for.
   */
  let liveHold = false;
  try {
    const holds = await loadHolds(env);
    liveHold = holds.some(
      (hold) => hold.requestId === id && !hold.released && Date.parse(hold.expiresAt) > Date.now(),
    );
  } catch {
    /*
     * A hold list that cannot be read is treated as "a hold may exist". Discarding is a convenience, so
     * refusing it on an unreadable store is the safe direction: it never frees nights blind.
     */
    return corsJson(
      request,
      { error: 'The date holds could not be read, so nothing was discarded. Try again in a moment.' },
      503,
    );
  }
  if (liveHold) {
    return corsJson(
      request,
      {
        error:
          "The guest's 30-minute hold is still running on those nights. Decline it, or wait for the hold to end, so the dates are not freed under a guest who is still asking.",
      },
      409,
    );
  }

  const next = rows.filter((candidate) => candidate.id !== id);
  try {
    /*
     * A deliberate removal, so the ledger guard is told why. `booking-requests` is not a ledger key, but
     * naming the reason keeps this file honest about the one place it drops a row.
     */
    await kvPut(env, 'booking-requests', next, { allowShrinkReason: 'The host discarded a request that never became a booking.' });
  } catch (err) {
    if (storageReadPaused(err)) {
      return corsJson(request, { error: 'The list could not be written. Nothing was discarded.' }, 503);
    }
    throw err;
  }

  return corsJson(
    request,
    {
      ok: true,
      id,
      remaining: next.length,
      /** Said plainly, because a host should never wonder whether a discard mailed the guest. */
      sent: 0,
      note: 'Discarded. Nothing was sent to the guest.',
    },
    200,
    { 'Cache-Control': 'no-store' },
  );
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
