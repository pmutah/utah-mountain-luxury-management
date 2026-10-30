import type { Reservation } from './api';
import { occupiedByHouse } from './availability';
import { bookingStartSummary } from './booking-starts';
import { workOrderNext } from './clean';
import { addDays } from './market/dates';
import type { YearPace } from './market/fill';
import { addonPhrase, lengthPhrase } from './open-arrivals';
import type { ClosedSpan } from './owner-ahead';
import { grossPace, type PaceStay } from './revenue-goals';
import { buildTurnovers } from './today';

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

/** Where the booking calendar asks for a longer start. No price and no Lindon. */
export function ownerStartLines(
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
    const text = bookingStartSummary(house, taken[house], asOf, pace);
    return { id: house, text };
  }).filter((line) => line.text.length > 0);
}

function shortWhen(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** The next Ranch and River checkout. No guest names, no prices, and no Lindon. */
export function ownerTurnLines(
  stays: Array<Pick<Reservation, 'id' | 'propertyId' | 'checkIn' | 'checkOut' | 'status'>>,
  asOf: string,
): OwnerOfferLine[] {
  const turns = buildTurnovers(
    stays.map((stay) => ({
      id: stay.id,
      propertyId: stay.propertyId,
      checkIn: stay.checkIn,
      checkOut: stay.checkOut,
      status: stay.status,
      guestName: '',
      payout: 0,
      source: '',
    })),
    asOf,
    90,
  );
  return HOUSES.map((house) => {
    const name = house === 'ranch' ? 'Ranch' : 'River';
    const turn = turns.find((item) => item.house === house);
    if (!turn) return { id: house, text: `${name}: no checkout in the next 90 days.` };
    return {
      id: house,
      text: `${name} checkout ${shortWhen(turn.checkout)}. ${workOrderNext(turn.nextCheckIn, turn.gapNights, 'en')}`,
    };
  });
}
