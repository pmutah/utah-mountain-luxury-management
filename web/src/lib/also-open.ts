import type { YearPace } from './market/fill';
import type { HouseId } from './market/types';
import { openArrivals } from './open-arrivals';
import { quoteStay } from './quote';
import { shortestStay } from './shortest-stay';

const HOUSES: HouseId[] = ['river', 'ranch', 'lindon'];
const HOUSE_NAME: Record<HouseId, string> = { river: 'River', ranch: 'Ranch', lindon: 'Lindon' };

export type AlsoOpen = {
  house: HouseId;
  direct: number;
  nights: number;
};

export type AlsoHeld = {
  house: HouseId;
  reason: string;
  /** A longer stay from the same check-in. Absent when the house still will not quote. */
  longer: { checkOut: string; nights: number } | null;
};

/** Other houses that will quote these dates. Choosing one does not hold the nights. */
export function alsoOpen(
  house: HouseId,
  checkIn: string,
  checkOut: string,
  taken: Partial<Record<HouseId, readonly string[]>>,
  asOf: string,
  paceFor: (house: HouseId) => YearPace,
  guests?: number,
  closed?: Partial<Record<HouseId, readonly string[]>>,
): AlsoOpen[] {
  return HOUSES.filter((id) => id !== house).flatMap((id) => {
    const quote = quoteStay(id, checkIn, checkOut, taken[id] ?? [], {
      asOf,
      pace: paceFor(id),
      closed: closed?.[id] ?? [],
      ...(guests !== undefined ? { guests } : {}),
    });
    if (!quote.ok) return [];
    return [{ house: id, direct: quote.stayTotal, nights: quote.nights.length }];
  });
}

/** Other houses that will not quote these dates. This list has no price and does not send a request. */
export function alsoHeld(
  house: HouseId,
  checkIn: string,
  checkOut: string,
  taken: Partial<Record<HouseId, readonly string[]>>,
  asOf: string,
  paceFor: (house: HouseId) => YearPace,
  guests?: number,
  closed?: Partial<Record<HouseId, readonly string[]>>,
): AlsoHeld[] {
  return HOUSES.filter((id) => id !== house).flatMap((id) => {
    const quote = quoteStay(id, checkIn, checkOut, taken[id] ?? [], {
      asOf,
      pace: paceFor(id),
      closed: closed?.[id] ?? [],
      ...(guests !== undefined ? { guests } : {}),
    });
    if (quote.ok || !quote.reason) return [];
    const name = HOUSE_NAME[id];
    const reason = quote.reason.includes('sleeps') ? quote.reason : `${name}: ${quote.reason}`;
    const blocked = /sleeps|already booked|first stays/i.test(quote.reason);
    const longerStay =
      blocked || /closed on the calendar/i.test(quote.reason)
        ? null
        : shortestStay(id, checkIn, taken[id] ?? [], asOf, paceFor(id), guests);
    const asked = quote.nights.length;
    const longer = longerStay && longerStay.nights > asked ? { checkOut: longerStay.checkOut, nights: longerStay.nights } : null;
    return [{ house: id, reason, longer }];
  });
}

/** How the other houses treat this house's next open arrival. No prices. */
export function comparePhrase(
  house: HouseId,
  taken: Partial<Record<HouseId, readonly string[]>>,
  asOf: string,
  paceFor: (house: HouseId) => YearPace,
  closed?: Partial<Record<HouseId, readonly string[]>>,
): string {
  const name = HOUSE_NAME[house];
  const first = openArrivals(house, taken[house] ?? [], asOf, paceFor(house), 1)[0];
  if (!first) return `${name} has no open arrival to compare.`;
  const open = alsoOpen(house, first.checkIn, first.checkOut, taken, asOf, paceFor, undefined, closed).map(
    (item) => HOUSE_NAME[item.house],
  );
  const held = alsoHeld(house, first.checkIn, first.checkOut, taken, asOf, paceFor, undefined, closed);
  const bits: string[] = [];
  if (open.length > 0) bits.push(`${open.join(' and ')} will quote the same dates`);
  for (const item of held) {
    const other = HOUSE_NAME[item.house];
    if (item.longer) bits.push(`${other} needs ${item.longer.nights} nights`);
    else if (/closed on the calendar/i.test(item.reason)) bits.push(`${other} is closed`);
    else if (/already booked/i.test(item.reason)) bits.push(`${other} is booked`);
    else if (/first stays/i.test(item.reason)) bits.push(`${other} is not open yet`);
    else if (/sleeps/i.test(item.reason)) bits.push(item.reason);
    else bits.push(`${other} will not quote these dates`);
  }
  return bits.length > 0 ? `${name}: ${bits.join('. ')}.` : `${name} has no other house to compare.`;
}
