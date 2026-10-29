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
export function occupiedNights(stays: StaySpan[], house: HouseId, from: string, until: string): string[] {
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
  stays: StaySpan[],
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
