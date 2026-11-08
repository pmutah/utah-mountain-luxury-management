import type { HouseId } from './types';

/**
 * Which house a saved comp is compared against.
 *
 * `both` means the Ranch and the River, which are the two houses one party can book together. It is
 * not "all three": the Lindon House is a separate 4-bedroom rental that Brandon owns alone, and it
 * has never been part of a two-house party.
 */
export type CompHouse = HouseId | 'both';

/**
 * The houses a comp can be compared against.
 *
 * A comp is entered on one house's tab, from that house's saved search. It used to be saved without
 * a house at all, and the band read a missing house as "every house" — so one River House comp, a
 * sleeps-18 canyon lodge at $2,100 a night, was counted in the Lindon House's band, where the ask is
 * $210. It passed the fit test (it sleeps more than Lindon does and sits inside 10 miles), so it
 * moved a rate nobody had compared it to. A comp with no house is now a comp that sets no band.
 */
export function compHouses(comp: { propertyId?: CompHouse | null }): HouseId[] {
  const value = comp.propertyId;
  if (value === 'both') return ['ranch', 'river'];
  if (value === 'ranch' || value === 'river' || value === 'lindon') return [value];
  return [];
}

/** True when this comp was entered for this house. A comp with no house is in no band. */
export function compIsForHouse(comp: { propertyId?: CompHouse | null }, house: HouseId): boolean {
  return compHouses(comp).includes(house);
}

/** The comps that belong to one house's band, in the order they were saved. */
export function compsForHouse<T extends { propertyId?: CompHouse | null }>(
  comps: readonly T[],
  house: HouseId,
): T[] {
  return comps.filter((comp) => compIsForHouse(comp, house));
}

/**
 * A saved comp that predates the house field, kept on the list so the host can see it and set a
 * house on it. It is not offered to any band until then, and the desk has to say so rather than
 * quietly dropping it.
 */
export function compNeedsHouse(comp: { propertyId?: CompHouse | null }): boolean {
  return compHouses(comp).length === 0;
}

/** Whether a value from a request is a house a comp can carry. */
export function isCompHouse(value: unknown): value is CompHouse {
  return value === 'ranch' || value === 'lindon' || value === 'river' || value === 'both';
}
