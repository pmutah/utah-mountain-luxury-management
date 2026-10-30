import type { YearPace } from './market/fill';
import type { HouseId } from './market/types';
import { quoteStay } from './quote';

const HOUSES: HouseId[] = ['river', 'ranch', 'lindon'];

export type AlsoOpen = {
  house: HouseId;
  direct: number;
  nights: number;
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
