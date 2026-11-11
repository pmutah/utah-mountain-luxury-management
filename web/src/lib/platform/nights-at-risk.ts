/**
 * Nights at risk.
 *
 * The plan lists "nights at risk" on Mission Control. A number that claims to predict whether a night will sell would be
 * invented, so this counts what is actually true from the calendar:
 *
 *   - an **open** night inside the lead window that no stay covers, and
 *   - of those, the ones **no stay can cover**, judged by the booking engine's own `bookableNights`.
 *
 * That second group is the real risk: a lone night between two bookings is not a night a guest can buy, so it will not
 * sell at any price. It is the "orphan gap" the rate plan already talks about.
 *
 * The test is `bookableNights` rather than a second copy of the minimum-stay rule, because a stranded-night count that
 * disagreed with the booking page would be worse than no count at all.
 *
 * Nothing here writes a rate, a calendar, or a booking.
 */

import { addDays, eachNight } from '../market/dates';
import { bookableNights } from '../market/bookable';
import type { YearPace } from '../market/fill';
import { nightAsk } from '../market/rates';
import type { HouseId } from '../market/types';

export type RiskStay = { propertyId: string; checkIn: string; checkOut: string; status?: string };

export type HouseRisk = {
  house: HouseId;
  /** Open nights in the window that no stay covers. */
  openNights: number;
  /** Open nights no stay can cover, so they cannot sell at any price. */
  unsellable: number;
  /** The first such night, so a host has somewhere to start. */
  firstUnsellable: string | null;
};

const HOUSES: HouseId[] = ['ranch', 'lindon', 'river'];

function covered(stays: RiskStay[], house: HouseId, asOf: string, until: string): string[] {
  const taken: string[] = [];
  for (const stay of stays) {
    if (stay.propertyId !== house) continue;
    if (stay.status === 'cancelled' || stay.status === 'blocked') continue;
    let cursor = stay.checkIn < asOf ? asOf : stay.checkIn;
    const stop = stay.checkOut < until ? stay.checkOut : until;
    while (cursor < stop) {
      taken.push(cursor);
      cursor = addDays(cursor, 1);
    }
  }
  return taken;
}

/**
 * Count the nights that are open but cannot be sold inside the lead window.
 *
 * `closed` is the calendar's own block list. A night the host closed on purpose is not at risk: they decided it.
 * The window defaults to 14 days, which is the lead time at which a vacancy starts to cost money rather than wait.
 *
 * `pace` is passed through to the booking engine because the published rate rules depend on it, and a night judged
 * unbookable at one pace and bookable at another has to match the booking page. `unknown` is the honest default.
 */
export function nightsAtRisk(input: {
  reservations: RiskStay[];
  asOf: string;
  horizonDays?: number;
  closed?: Partial<Record<HouseId, string[]>>;
  pace?: YearPace;
}): HouseRisk[] {
  const horizon = input.horizonDays ?? 14;
  const until = addDays(input.asOf, horizon);
  const dates = eachNight(input.asOf, horizon);

  return HOUSES.map((house) => {
    const taken = covered(input.reservations, house, input.asOf, until);
    const closed = input.closed?.[house] ?? [];
    const takenSet = new Set(taken);
    const closedSet = new Set(closed);

    const open = dates.filter((iso) => !takenSet.has(iso) && !closedSet.has(iso) && !nightAsk(house, iso).closed);
    const bookable = bookableNights(house, open, taken, input.asOf, input.pace ?? 'unknown', closed);
    const unsellableNights = open.filter((iso) => !bookable.has(iso));

    return {
      house,
      openNights: open.length,
      unsellable: unsellableNights.length,
      firstUnsellable: unsellableNights[0] ?? null,
    };
  });
}

/** One line per house for the desk. A house with nothing stranded is left out, so the list stays short. */
export function nightsAtRiskLine(rows: HouseRisk[], horizonDays = 14): string {
  const risky = rows.filter((row) => row.unsellable > 0);
  if (risky.length === 0) {
    return `Every open night in the next ${horizonDays} days can be booked by some stay. Nothing is stranded.`;
  }
  const name: Record<HouseId, string> = { ranch: 'Ranch', lindon: 'Lindon', river: 'River' };
  const parts = risky.map(
    (row) =>
      `${name[row.house]} ${row.unsellable} of ${row.openNights} open night${row.openNights === 1 ? '' : 's'}`,
  );
  return `${parts.join(', ')} sit where no stay can be booked, so ${risky.length === 1 ? 'that night cannot' : 'those nights cannot'} sell at any price. This counts the calendar; it does not predict a sale.`;
}
