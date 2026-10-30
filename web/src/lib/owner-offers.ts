import type { Reservation } from './api';
import { occupiedByHouse } from './availability';
import { addDays } from './market/dates';
import type { YearPace } from './market/fill';
import { addonPhrase, lengthPhrase } from './open-arrivals';
import type { ClosedSpan } from './owner-ahead';
import { grossPace, type PaceStay } from './revenue-goals';

const HOUSES = ['ranch', 'river'] as const;

export type OwnerOfferLine = {
  id: (typeof HOUSES)[number];
  text: string;
};

/** Lengths and add-ons for Ranch and River. No price and no Lindon. */
export function ownerOfferLines(
  stays: Array<Pick<Reservation, 'propertyId' | 'checkIn' | 'checkOut' | 'status'> & { payout?: number }>,
  asOf: string,
  closed: readonly ClosedSpan[] = [],
): OwnerOfferLine[] {
  const spans = [
    ...stays,
    ...closed.map((block) => ({
      propertyId: block.propertyId,
      checkIn: block.start,
      checkOut: block.end,
    })),
  ];
  const taken = occupiedByHouse(spans, asOf, addDays(asOf, 180));
  const paceStays: PaceStay[] = stays.map((stay) => ({
    propertyId: stay.propertyId,
    checkIn: stay.checkIn,
    checkOut: stay.checkOut,
    status: stay.status,
    payout: Number(stay.payout) || 0,
  }));
  return HOUSES.map((house) => {
    const pace: YearPace = grossPace(house, paceStays, asOf).stillNeeded > 0 ? 'short' : 'met';
    const text = `${lengthPhrase(house, taken[house], asOf, pace)}. ${addonPhrase(house, taken[house], asOf, pace)}.`;
    return { id: house, text };
  });
}
