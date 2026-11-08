import { SLEEPS } from '../house-stay';
import type { HouseId } from './types';

/** A sample is close in size when it sleeps at least 60% of this house. */
export function isCloseSleep(house: HouseId, sleeps: number): boolean {
  return sleeps * 5 >= SLEEPS[house] * 3;
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
 * The word "sample" used to be hardcoded, so even a list built from **live** comps was described as
 * samples. On the market page that read "5 of 10 sample comps" for River while 19 real comps sat in the
 * store — a sentence that was wrong about its own data. The caller now says which it is, and the default
 * stays "sample" so existing sample-based callers keep an accurate description.
 */
export function compFitSummary(
  house: HouseId,
  comps: readonly { sleeps: number; distanceMi: number }[],
  kind: 'sample' | 'saved' = 'sample',
): string {
  const close = comps.filter((comp) => isFairComp(house, comp)).length;
  const total = comps.length;
  const noun = kind === 'saved' ? (total === 1 ? 'saved comp' : 'saved comps') : 'sample comps';
  if (close >= 4) {
    return `${close} of ${total} ${noun} sleep close to this house and sit within 10 miles. The rate band uses those ${close}. Smaller or farther houses stay on the list and stay out of the band.`;
  }
  return `${close} of ${total} ${noun} sleep close to this house and sit within 10 miles. The rate band keeps the full list because fewer than 4 are close.`;
}
