import type { Reservation } from './api';
import { hostArrivalPhrase } from './arrival';
import { hostDeparturePhrase } from './departure';
import { occupiedByHouse } from './availability';
import { bookingStartSummary } from './booking-starts';
import { workOrderNext } from './clean';
import { addDays } from './market/dates';
import type { YearPace } from './market/fill';
import { addonPhrase, lengthPhrase } from './open-arrivals';
import type { ClosedSpan } from './owner-ahead';
import { grossPace, type PaceStay } from './revenue-goals';
import { noteChildCount, noteGuestCount } from './note-party';
import { buildTurnovers } from './today';

const HOUSES = ['ranch', 'river'] as const;

export type OwnerOfferLine = {
  id: (typeof HOUSES)[number];
  text: string;
};

export type OwnerArrivalLine = {
  id: string;
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
  windows?: Readonly<Record<string, string | undefined>> | null,
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
    const departure = windows ? ` ${hostDeparturePhrase(windows[turn.checkoutStayId])}` : '';
    return {
      id: house,
      text: `${name} checkout ${shortWhen(turn.checkout)}. ${workOrderNext(turn.nextCheckIn, turn.gapNights, 'en')}${departure}`,
    };
  });
}

function nightsBetween(checkIn: string, checkOut: string): number {
  const start = Date.parse(`${checkIn}T00:00:00Z`);
  const end = Date.parse(`${checkOut}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.round((end - start) / 86400000);
}

/** Ranch and River stays that begin in the next 90 days. No names, no prices, and no Lindon. */
export function ownerArrivalLines(
  stays: Array<Pick<Reservation, 'propertyId' | 'checkIn' | 'checkOut' | 'status' | 'note'> & { id?: string }>,
  asOf: string,
  windows?: Readonly<Record<string, string | undefined>> | null,
): OwnerArrivalLine[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
    return [{ id: 'none', text: 'No Ranch or River stay begins in the next 90 days.' }];
  }
  const until = addDays(asOf, 90);
  const rows = stays
    .filter((stay) => stay.propertyId === 'ranch' || stay.propertyId === 'river')
    .filter((stay) => stay.status !== 'cancelled' && stay.status !== 'blocked')
    .filter((stay) => /^\d{4}-\d{2}-\d{2}$/.test(stay.checkIn) && /^\d{4}-\d{2}-\d{2}$/.test(stay.checkOut))
    .filter((stay) => stay.checkIn >= asOf && stay.checkIn < until && stay.checkOut > stay.checkIn)
    .sort((a, b) => a.checkIn.localeCompare(b.checkIn) || a.propertyId.localeCompare(b.propertyId));
  if (rows.length === 0) return [{ id: 'none', text: 'No Ranch or River stay begins in the next 90 days.' }];
  return rows.map((stay) => {
    const nights = nightsBetween(stay.checkIn, stay.checkOut);
    const count = noteGuestCount(stay.note);
    const children = noteChildCount(stay.note);
    const kidBit = children !== null && children >= 1 ? (children === 1 ? ', including 1 child' : `, including ${children} children`) : '';
    const party =
      count === null
        ? children !== null && children >= 1
          ? `The booking names ${children === 1 ? '1 child' : `${children} children`} and does not say how many guests.`
          : 'The booking does not say how many guests.'
        : count === 1
          ? `The booking says 1 guest${kidBit}.`
          : `The booking says ${count} guests${kidBit}.`;
    const house = stay.propertyId === 'ranch' ? 'Ranch' : 'River';
    const arrival = windows ? ` ${hostArrivalPhrase(stay.id ? windows[stay.id] : undefined)}` : '';
    return {
      id: `${stay.propertyId}-${stay.checkIn}-${stay.checkOut}`,
      text: `${house} ${shortWhen(stay.checkIn)} for ${nights} ${nights === 1 ? 'night' : 'nights'}. ${party}${arrival}`,
    };
  });
}
