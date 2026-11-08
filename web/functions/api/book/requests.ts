import { corsJson } from '../../_lib/data';
import { hostDenied, hostOnly } from '../../_lib/auth';
import { kvGet } from '../../_lib/kv-json';
import { storageReadPaused } from '../../_lib/kv-json';
import { getAllReservations } from '../../_lib/reservations-store';
import { loadCalendarBlocks } from '../../_lib/calendar-store';
import { occupiedNights, type StaySpan } from '../../../src/lib/availability';
import { bookingInbox, inboxSummary, type BookingRequestRow } from '../../../src/lib/booking-inbox';
import { declineLine, declineTally, isDeclineReason } from '../../../src/lib/booking-decline';
import { suggestedPayoutLine, suggestedPayouts } from '../../../src/lib/payout-suggest';
import { loadApprovedRates } from '../../_lib/pricing-store';
import { addDays, denverToday } from '../../../src/lib/market/dates';
import type { HouseId } from '../../../src/lib/market/types';
import type { SettingsEnv } from '../../_lib/kv';

const HOUSES: HouseId[] = ['river', 'ranch', 'lindon'];

/** The host inbox for direct requests. Read only: nothing is booked, held, or answered. */
export const onRequestGet: PagesFunction<SettingsEnv & { DASHBOARD_PASSWORD?: string }> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  let requests: BookingRequestRow[];
  let stays;
  let blocks;
  try {
    requests = await kvGet<BookingRequestRow[]>(env, 'booking-requests', []);
    stays = await getAllReservations(env);
    blocks = await loadCalendarBlocks(env);
  } catch (err) {
    if (storageReadPaused(err)) {
      return corsJson(
        request,
        {
          rows: null,
          summary: null,
          storageReads: 'paused',
          error: 'Saved requests could not be read. Nothing was written over them.',
        },
        503,
      );
    }
    const message = err instanceof Error ? err.message : 'Requests failed';
    return corsJson(request, { error: message }, 500);
  }
  const spans: StaySpan[] = [
    ...stays.map((stay) => ({
      propertyId: stay.propertyId,
      checkIn: stay.checkIn,
      checkOut: stay.checkOut,
      status: stay.status,
    })),
    ...blocks.map((block) => ({
      propertyId: block.propertyId,
      checkIn: block.start,
      checkOut: block.end,
    })),
  ];
  const taken: Partial<Record<HouseId, readonly string[]>> = {};
  for (const house of HOUSES) {
    taken[house] = occupiedNights(spans, house, denverToday(), '2099-12-31');
  }
  const rows = bookingInbox(requests, taken, denverToday());
  /*
   * The list is capped so the desk stays readable, but the summary must not pretend the cap is the
   * whole list: twelve answered rows plus eight hidden waiting ones used to read as "all answered",
   * and those eight never got a reply.
   */
  const shownIds = new Set(rows.map((row) => row.id));
  const hidden = requests.filter((row) => !shownIds.has(row.id)).length;
  const accepted = new Set(
    stays.map((stay) => (stay.note ?? '').match(/Direct request (\S+)\./)?.[1]).filter((id): id is string => Boolean(id)),
  );
  let declines: Array<{ id: string; reason: string; note?: string; at: string }> = [];
  try {
    declines = await kvGet<Array<{ id: string; reason: string; note?: string; at: string }>>(env, 'bookingDeclines', []);
  } catch {
    declines = [];
  }
  const declined = new Map(declines.map((row) => [row.id, row]));
  // A repeated reason is a pricing or rule signal, so the desk gets the count and not just the rows.
  const tally = declineTally(declines, addDays(denverToday(), -30));

  /*
   * What to accept each request for. The desk asked the host to type a payout with no price on the
   * screen, so the number was a guess. This uses the same quote code the guest page uses, and the
   * same approved sheet, so the figure the host sees is the figure the guest was quoted.
   */
  let approved: Array<{ house: string; date: string; guest: number }> = [];
  let sheetReadsPaused = false;
  try {
    approved = (await loadApprovedRates(env)).map((row) => ({ house: row.house, date: row.date, guest: row.guest }));
  } catch (err) {
    // A sheet that cannot be read is not "no approved nights": the desk says so instead of showing a
    // card price as if it were what the guest was quoted.
    sheetReadsPaused = storageReadPaused(err);
    approved = [];
  }

  return corsJson(
    request,
    {
      rows: rows.map((row) => {
        const record = declined.get(row.id);
        const saved = requests.find((item) => item.id === row.id);
        /*
         * A per-house map, not one merged list. The payout code matches an approved row by date
         * alone, so handing it both houses at once meant the stored order decided which house's
         * approved price applied. The same two-house request priced three ways for three orderings,
         * and one of them put the Ranch's rate on the River House.
         */
        const houses = saved
          ? [saved.propertyId, saved.alsoPropertyId].filter(
              (house): house is string => typeof house === 'string' && house.length > 0,
            )
          : [];
        const sheets: Partial<Record<HouseId, Array<{ date: string; guest: number }>>> = {};
        for (const house of houses) {
          sheets[house as HouseId] = approved
            .filter((entry) => entry.house === house)
            .map((entry) => ({ date: entry.date, guest: entry.guest }));
        }
        const payouts = saved
          ? suggestedPayouts(
              {
                propertyId: saved.propertyId,
                alsoPropertyId: saved.alsoPropertyId,
                checkIn: saved.checkIn,
                checkOut: saved.checkOut,
                ...(saved.guests !== undefined ? { guests: saved.guests } : {}),
                ...(saved.children !== undefined ? { children: saved.children } : {}),
              },
              { sheets },
            )
          : [];
        return {
          ...row,
          accepted: accepted.has(row.id),
          declined: Boolean(record),
          ...(record && isDeclineReason(record.reason)
            ? { declineLine: declineLine({ reason: record.reason, note: record.note, at: record.at }) }
            : {}),
          // What to accept it for, so the host is not typing blind.
          payouts,
          payoutLine: sheetReadsPaused
            ? 'The approved prices could not be read, so this figure may not be what the guest saw. Check it before you accept.'
            : suggestedPayoutLine(payouts),
        };
      }),
      summary: inboxSummary(rows, hidden),
      declineTally: tally,
      storageReads: 'ok',
    },
    200,
    { 'Cache-Control': 'no-store' },
  );
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
