import { addDays } from './market/dates';
import type { HouseId } from './market/types';

export type StaySpan = {
  propertyId: string;
  checkIn: string;
  checkOut: string;
  status?: string;
};

const HOUSES: HouseId[] = ['ranch', 'lindon', 'river'];

export function isHouseId(id: string): id is HouseId {
  return id === 'ranch' || id === 'lindon' || id === 'river';
}

/** Nights a guest cannot book. Cancelled stays are free. Check-out day is free. */
export function occupiedNights(stays: readonly StaySpan[], house: HouseId, from: string, until: string): string[] {
  const taken = new Set<string>();
  for (const stay of stays) {
    if (stay.propertyId !== house || stay.status === 'cancelled') continue;
    if (!stay.checkIn || !stay.checkOut || stay.checkOut <= stay.checkIn) continue;
    let cursor = stay.checkIn > from ? stay.checkIn : from;
    const stop = stay.checkOut < until ? stay.checkOut : until;
    while (cursor < stop) {
      taken.add(cursor);
      cursor = addDays(cursor, 1);
    }
  }
  return [...taken].sort();
}

export function occupiedByHouse(
  stays: readonly StaySpan[],
  from: string,
  until: string,
): Record<HouseId, string[]> {
  return {
    ranch: occupiedNights(stays, 'ranch', from, until),
    lindon: occupiedNights(stays, 'lindon', from, until),
    river: occupiedNights(stays, 'river', from, until),
  };
}

export { HOUSES };

/**
 * Houses a request must keep free. A second house is included only when it is a different house.
 *
 * A first house that is not one of the three makes the whole request invalid: it does not fall back
 * to the second house. Before this, `('denver', 'ranch')` returned `['ranch']`, so a request naming a
 * house we do not rent could pass a check that only looked at the Ranch.
 */
export function housesForRequest(propertyId: string, alsoPropertyId = ''): HouseId[] {
  if (!isHouseId(propertyId)) return [];
  const houses: HouseId[] = [propertyId];
  const also = alsoPropertyId.trim();
  if (isHouseId(also) && also !== propertyId) houses.push(also);
  return houses;
}

/** The first requested house that already has one of these nights. Null when every house is free. */
export function blockedRequestHouse(
  stays: readonly StaySpan[],
  houses: readonly HouseId[],
  checkIn: string,
  checkOut: string,
): HouseId | null {
  if (!checkIn || !checkOut || checkOut <= checkIn) return null;
  for (const house of houses) {
    if (occupiedNights(stays, house, checkIn, checkOut).length > 0) return house;
  }
  return null;
}
