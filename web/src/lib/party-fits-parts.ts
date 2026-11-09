import type { RiverUnitId } from './river-units';
import { RIVER_UNIT_DETAIL } from './river-units';

/**
 * Whether a party fits the parts a guest chose, and what to tell them when it does not.
 *
 * The booking page let a party of nine submit a request for the Garage Suite, which sleeps four. The server refused it —
 * `unitRequestCheck` has an `over-capacity` code and returns the real numbers — but only after the guest had filled in
 * name, email, phone, dates, and the house-rules acknowledgement. A form that accepts a request it knows cannot work is
 * a form that wastes the guest's time and makes the refusal look like a fault.
 *
 * The capacity is read from the same `RIVER_UNIT_DETAIL` the gate uses, so the two cannot disagree.
 */

export type PartyFit =
  | { ok: true; sleeps: number; guests: number }
  | { ok: false; sleeps: number; guests: number; reason: string; code: 'too-many' | 'no-guests' | 'no-sleeps' };

/** How many the chosen parts sleep between them, from the published capacities. */
export function partsSleeps(units: readonly RiverUnitId[]): number {
  return units.reduce((sum, unit) => sum + (RIVER_UNIT_DETAIL.find((detail) => detail.id === unit)?.sleeps ?? 0), 0);
}

/**
 * Check a party against the chosen parts.
 *
 * `guests` is null before the guest has said how many are coming, which is not a failure — it is simply not answered yet.
 * A guest count of zero is refused, because a stay with nobody in it is not a stay.
 */
export function partyFitsParts(units: readonly RiverUnitId[], guests: number | null | undefined): PartyFit | null {
  // No parts chosen means the whole house, which the existing house-level check already covers.
  if (units.length === 0) return null;
  const sleeps = partsSleeps(units);
  if (guests === null || guests === undefined) return null;
  if (!Number.isInteger(guests) || guests < 1) {
    return {
      ok: false,
      sleeps,
      guests: typeof guests === 'number' ? guests : 0,
      reason: `${sleeps === 1 ? 'These parts sleep' : 'These parts sleep'} ${sleeps}. Say how many guests are coming.`,
      code: 'no-guests',
    };
  }
  if (sleeps <= 0) {
    // A part with no capacity recorded is not a part we can judge, so it is refused rather than assumed to fit.
    return {
      ok: false,
      sleeps,
      guests,
      reason: 'These parts have no capacity recorded, so this booking cannot be checked.',
      code: 'no-sleeps',
    };
  }
  if (guests > sleeps) {
    const more = guests - sleeps;
    return {
      ok: false,
      sleeps,
      guests,
      reason: `These parts sleep ${sleeps}, and this party is ${guests}. ${more === 1 ? 'One guest is' : `${more} guests are`} over — add another part or book the whole house.`,
      code: 'too-many',
    };
  }
  return { ok: true, sleeps, guests };
}
