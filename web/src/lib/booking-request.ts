import { housesForRequest, occupiedNights, type StaySpan } from './availability';
import { compoundOffer } from './compound';
import { SLEEPS } from './house-stay';
import { quoteStay } from './quote';
import type { HouseId } from './market/types';

const NAME: Record<HouseId, string> = {
  river: 'River',
  ranch: 'Ranch',
  lindon: 'Lindon',
};

export type BookingRequestCheck = {
  propertyId: string;
  alsoPropertyId?: string;
  checkIn: string;
  checkOut: string;
  stays: readonly StaySpan[];
  blocks?: readonly StaySpan[];
  asOf: string;
  guests?: number;
  children?: number;
};

/** Why this request must not be saved. Null means the dates, the houses, and the guest count can be saved. */
export function bookingRequestHold(input: BookingRequestCheck): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(input.checkOut) || input.checkOut <= input.checkIn) {
    return 'This stay is not quoted.';
  }
  const houses = housesForRequest(input.propertyId, input.alsoPropertyId ?? '');
  if (houses.length === 0) return 'This stay is not quoted.';
  if (houses.length === 2 && !(houses.includes('river') && houses.includes('ranch'))) {
    return 'Both houses on one request are the River House and the Ranch House.';
  }
  const partyGuests =
    typeof input.guests === 'number' && Number.isInteger(input.guests) && input.guests >= 1 ? input.guests : undefined;
  const blocks = input.blocks ?? [];
  const together = houses.length === 2 && partyGuests !== undefined;
  if (together) {
    const taken: Partial<Record<HouseId, readonly string[]>> = {};
    const closed: Partial<Record<HouseId, readonly string[]>> = {};
    for (const house of houses) {
      taken[house] = occupiedNights([...input.stays, ...blocks], house, input.checkIn, input.checkOut);
      closed[house] = occupiedNights(blocks, house, input.checkIn, input.checkOut);
    }
    const offer = compoundOffer(
      input.checkIn,
      input.checkOut,
      partyGuests,
      input.children,
      taken,
      input.asOf,
      () => 'unknown',
      closed,
    );
    if (!offer.show) {
      return partyGuests <= SLEEPS.river ? 'This party fits one house.' : 'This stay is not quoted.';
    }
    if (!offer.ok) return offer.reason;
    return null;
  }
  for (const house of houses) {
    const taken = occupiedNights([...input.stays, ...blocks], house, input.checkIn, input.checkOut);
    const closed = occupiedNights(blocks, house, input.checkIn, input.checkOut);
    const quote = quoteStay(house, input.checkIn, input.checkOut, taken, {
      asOf: input.asOf,
      closed,
      pace: 'unknown',
      ...(houses.length === 1 && partyGuests !== undefined
        ? { guests: partyGuests, ...(input.children !== undefined ? { children: input.children } : {}) }
        : {}),
    });
    if (quote.ok) continue;
    const reason = quote.reason && !quote.reason.includes('$') ? quote.reason : 'This stay is not quoted.';
    return houses.length > 1 ? `${NAME[house]}: ${reason}` : reason;
  }
  if (partyGuests === undefined) return 'Add the number of overnight guests.';
  return null;
}
