import { corsJson } from '../../_lib/data';
import { buildMarketBoard } from '../../../src/lib/market/board';
import { denverToday } from '../../../src/lib/market/dates';
import { grossPace } from '../../../src/lib/revenue-goals';
import type { YearPace } from '../../../src/lib/market/fill';
import { occupiedNights, type StaySpan } from '../../../src/lib/availability';
import { getAllReservations } from '../../_lib/reservations-store';
import { loadLiveNights, loadApprovedRates } from '../../_lib/pricing-store';
import { storageReadPaused } from '../../_lib/kv-json';
import type { SettingsEnv } from '../../_lib/kv';

function houseFrom(value: string | null) {
  if (value === 'ranch' || value === 'lindon' || value === 'river') return value;
  return 'river';
}

/**
 * The market board. Saved comps with a sleep count and a distance, and the asks they carry, set the
 * band. A night with no saved ask keeps the sample, and the board says which it used.
 */
export const onRequestGet: PagesFunction<SettingsEnv> = async ({ request, env }) => {
  const url = new URL(request.url);
  const house = houseFrom(url.searchParams.get('house'));
  const from = denverToday();
  const days = Math.min(180, Math.max(7, Number(url.searchParams.get('days')) || 90));
  let live = null;
  let storageReads: 'ok' | 'paused' = 'ok';
  /** Booked nights and the year's pace for the fill promotion. Absent when they could not be read. */
  let fill: { taken: string[]; pace: YearPace } | undefined;
  // Approved nights, so the board a host reads starts from the published price rather than the card.
  let approved: Array<{ house: string; date: string; guest: number }> = [];
  try {
    live = await loadLiveNights(env, house, from, days);
    approved = (await loadApprovedRates(env)).map((row) => ({ house: row.house, date: row.date, guest: row.guest }));
    /*
     * Booked nights and the year's pace, from the stays this route can read. Both default to "not known" when the read
     * fails, so a promotion is never recommended off a stand-in calendar.
     */
    const stays = await getAllReservations(env);
    const spans: StaySpan[] = stays.map((stay) => ({
      propertyId: stay.propertyId,
      checkIn: stay.checkIn,
      checkOut: stay.checkOut,
      status: stay.status,
      // Units, so a part booking does not read as the whole house on a night it never took.
      ...(stay.units && stay.units.length > 0 ? { units: stay.units } : {}),
    }));
    const taken = occupiedNights(spans, house, from, `${from.slice(0, 4)}-12-31`);
    const pace: YearPace = grossPace(house, stays, from).stillNeeded > 0 ? 'short' : 'met';
    fill = { taken, pace };
  } catch (err) {
    if (!storageReadPaused(err)) throw err;
    storageReads = 'paused';
  }
  const board = buildMarketBoard(
    house,
    from,
    days,
    undefined,
    live ? live : null,
    approved.filter((row) => row.house === house).map((row) => ({ date: row.date, guest: row.guest })),
    /*
     * The promotion needs the calendar and the pace, exactly as the shadow run does. Both were absent here, so
     * `promotionForNight` would have answered "not loaded" on every night and the board would have said "no promotion is
     * recommended" forever — the same silent withholding this route's sibling already fixed for pace.
     *
     * A failed read leaves both undefined, which reads as "not known": the board then says no promotion is recommended
     * rather than inventing one from a stand-in calendar.
     */
    fill,
  );
  return corsJson(
    request,
    { ...board, storageReads },
    200,
    { 'Cache-Control': 'no-store' },
  );
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
