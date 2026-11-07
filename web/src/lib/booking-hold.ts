import { housesForRequest, occupiedNights, type StaySpan } from './availability';
import { addDays } from './market/dates';
import type { HouseId } from './market/types';

/** How long a guest has to finish a request before the hold lets go. */
export const HOLD_MINUTES = 30;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export type BookingHold = {
  id: string;
  /** Houses this hold keeps. One row per house so a two-house request holds both. */
  propertyId: HouseId;
  checkIn: string;
  checkOut: string;
  /** ISO stamp when the hold stops blocking a new request. */
  expiresAt: string;
  createdAt: string;
  /** The request this hold belongs to, so the host can tie a hold to an inbox row. */
  requestId: string;
};

/** A hold that a guest gave up. It stays saved but stops blocking. */
export type HoldWithState = BookingHold & { released?: boolean };

/**
 * The hold window. A hold is over at or after `expiresAt`; the exact minute is inclusive so
 * a guest is never cut off early by a clock that runs a second fast.
 */
export function holdExpired(hold: Pick<BookingHold, 'expiresAt'>, now: Date): boolean {
  const at = Date.parse(hold.expiresAt);
  if (Number.isNaN(at)) return true;
  return now.getTime() >= at;
}

export function holdExpiresAt(now: Date, minutes = HOLD_MINUTES): string {
  return new Date(now.getTime() + minutes * 60_000).toISOString();
}

/** Only holds that still block. A released hold, an expired hold, or a broken row stays out. */
export function activeHolds(holds: readonly HoldWithState[], now: Date): BookingHold[] {
  return holds.filter(
    (hold) =>
      !hold.released &&
      DATE.test(hold.checkIn) &&
      DATE.test(hold.checkOut) &&
      hold.checkOut > hold.checkIn &&
      !holdExpired(hold, now),
  );
}

function nightsOf(checkIn: string, checkOut: string): string[] {
  if (!DATE.test(checkIn) || !DATE.test(checkOut) || checkOut <= checkIn) return [];
  const nights: string[] = [];
  let cursor = checkIn;
  for (let guard = 0; guard < 400 && cursor < checkOut; guard += 1) {
    nights.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return nights;
}

/**
 * The houses a new request cannot use because a live hold covers one of its nights.
 * A stay and a calendar block count the same way: if the night is taken, the hold is in the way.
 */
export function holdConflict(
  holds: readonly HoldWithState[],
  stays: readonly StaySpan[],
  propertyId: string,
  alsoPropertyId: string,
  checkIn: string,
  checkOut: string,
  now: Date,
): HouseId | null {
  const houses = housesForRequest(propertyId, alsoPropertyId);
  if (houses.length === 0) return null;
  const wanted = new Set(nightsOf(checkIn, checkOut));
  if (wanted.size === 0) return null;
  for (const house of houses) {
    const live = activeHolds(holds, now).filter((hold) => hold.propertyId === house);
    if (live.some((hold) => nightsOf(hold.checkIn, hold.checkOut).some((night) => wanted.has(night)))) {
      return house;
    }
    const taken = new Set(occupiedNights(stays, house, checkIn, checkOut));
    if (taken.size > 0) return house;
  }
  return null;
}

const NAME: Record<HouseId, string> = {
  river: 'The River House',
  ranch: 'The Ranch House',
  lindon: 'The Lindon House',
};

/** Why a request is on hold. No guest name, no price, and it does not say the house is open. */
export function holdConflictLine(house: HouseId | null): string | null {
  if (!house) return null;
  const line = `${NAME[house]} has those nights held while another guest finishes. Nothing is booked. Try other dates or ask us.`;
  return line.includes('$') ? null : line;
}

/**
 * How much of the window is still free. The board uses this so a guest sees a hold rather than
 * being told the night is booked.
 */
export function holdNights(holds: readonly HoldWithState[], house: HouseId, from: string, until: string, now: Date): string[] {
  const live = activeHolds(holds, now).filter((hold) => hold.propertyId === house);
  const nights = new Set<string>();
  for (const hold of live) {
    for (const night of nightsOf(hold.checkIn, hold.checkOut)) {
      if (night >= from && night < until) nights.add(night);
    }
  }
  return [...nights].sort();
}

/** A short line for the quote. It does not call the night booked, and it has no name. */
export function holdNote(held: readonly string[]): string {
  if (held.length === 0) return '';
  const count = held.length === 1 ? '1 night' : `${held.length} nights`;
  return `${count} ${held.length === 1 ? 'is' : 'are'} held while another guest finishes. Nothing is booked yet.`;
}
