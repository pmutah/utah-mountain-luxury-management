import type { YearPace } from './market/fill';
import type { HouseId } from './market/types';
import { quoteStay } from './quote';

const HOUSES: HouseId[] = ['river', 'ranch', 'lindon'];

export type AlsoOpen = {
  house: HouseId;
  direct: number;
  nights: number;
};

export type AlsoHeld = {
  house: HouseId;
  reason: string;
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
): AlsoOpen[] {
  return HOUSES.filter((id) => id !== house).flatMap((id) => {
    const quote = quoteStay(id, checkIn, checkOut, taken[id] ?? [], {
      asOf,
      pace: paceFor(id),
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
): AlsoHeld[] {
  return HOUSES.filter((id) => id !== house).flatMap((id) => {
    const quote = quoteStay(id, checkIn, checkOut, taken[id] ?? [], {
      asOf,
      pace: paceFor(id),
      ...(guests !== undefined ? { guests } : {}),
    });
    if (quote.ok || !quote.reason) return [];
    const name = id === 'ranch' ? 'Ranch' : id === 'lindon' ? 'Lindon' : 'River';
    const reason = quote.reason.includes('sleeps') ? quote.reason : `${name}: ${quote.reason}`;
    return [{ house: id, reason }];
  });
}
