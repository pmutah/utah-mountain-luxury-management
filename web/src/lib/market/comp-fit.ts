import { SLEEPS } from '../house-stay';
import type { HouseId } from './types';

/**
 * A sample is close in size when it sleeps **between 60% and 150% of this house**.
 *
 * The upper bound was missing, and it is not theoretical: a comp that sleeps twice the house passed the old rule, so a
 * 16-guest Orem house could set the rate for a 12-guest Lindon house and price it up. A house twice the size has more
 * bedrooms, more bathrooms, and usually a pool — its ask is a different product's ask.
 *
 * 150% leaves room for the honest case where a comp is a little larger than ours (a 16-sleeper against a 12, which is what
 * most of the Lindon market is), while refusing one that is a different class of house.
 */
export function isCloseSleep(house: HouseId, sleeps: number): boolean {
  if (!Number.isFinite(sleeps) || sleeps <= 0) return false;
  const houseSleeps = SLEEPS[house];
  return sleeps * 5 >= houseSleeps * 3 && sleeps * 2 <= houseSleeps * 3;
}

/** A sample is nearby at 10 miles or less. Farther than that is a different market. */
export function isNearby(distanceMi: number): boolean {
  return distanceMi <= 10;
}

export function isFairComp(house: HouseId, comp: { sleeps: number; distanceMi: number }): boolean {
  return isCloseSleep(house, comp.sleeps) && isNearby(comp.distanceMi);
}

export function bandComps<T extends { sleeps: number; distanceMi: number }>(
  house: HouseId,
  comps: readonly T[],
): { used: T[]; narrowed: boolean } {
  const close = comps.filter((comp) => isFairComp(house, comp));
  if (close.length >= 4) return { used: [...close], narrowed: true };
  return { used: [...comps], narrowed: false };
}

function miles(distanceMi: number): string {
  return Number.isInteger(distanceMi) ? String(distanceMi) : String(distanceMi);
}

export function compFitLine(house: HouseId, sleeps: number, distanceMi: number, inBand: boolean): string {
  const ours = SLEEPS[house];
  const place = `Sleeps ${sleeps} of our ${ours}, ${miles(distanceMi)} mi.`;
  const size = isCloseSleep(house, sleeps);
  const near = isNearby(distanceMi);
  if (size && near) return `${place} Close enough to compare.`;
  if (inBand) {
    if (!size && !near) return `${place} Smaller and farther. Kept because fewer than 4 samples are close.`;
    if (!size) return `${place} A smaller house. Kept because fewer than 4 samples are close.`;
    return `${place} Too far. Kept because fewer than 4 samples are close.`;
  }
  if (!size && !near) return `${place} A smaller house and too far. Left out of the rate band.`;
  if (!size) return `${place} A smaller house. Left out of the rate band.`;
  return `${place} Too far. Left out of the rate band.`;
}

/**
 * How much of a house's comp list can actually set its band.
 *
 * **`kind` is required.** It used to default to `'sample'`, which meant any caller that forgot it silently
 * described real comps as samples — and two of three call sites did forget, on the same page, at the same
 * time: the shop's own digest said "saved comps" while the caption directly beneath the table said
 * "4 of 4 sample comps" about the same four listings. A default that is wrong for the majority of callers is
 * not a default; making it required lets the compiler find the next caller instead of a screenshot doing it.
 */
export function compFitSummary(
  house: HouseId,
  comps: readonly { sleeps: number; distanceMi: number }[],
  kind: 'sample' | 'saved',
): string {
  const close = comps.filter((comp) => isFairComp(house, comp)).length;
  const total = comps.length;
  const noun = kind === 'saved' ? (total === 1 ? 'saved comp' : 'saved comps') : 'sample comps';
  if (close >= 4) {
    return `${close} of ${total} ${noun} sleep close to this house and sit within 10 miles. The rate band uses those ${close}. Smaller or farther houses stay on the list and stay out of the band.`;
  }
  return `${close} of ${total} ${noun} sleep close to this house and sit within 10 miles. The rate band keeps the full list because fewer than 4 are close.`;
}
