/**
 * Which Hospitable property each listing is.
 *
 * Verified live by the owner on 2026-11-10. These are the only uuids this app may write to: a write to the wrong one changes
 * another listing's calendar, and a typo cannot be caught by shape because a uuid looks valid either way.
 *
 * **There is no Ranch House in this Hospitable account.** The owner confirmed that: the Ranch is not in the list. So a push
 * for the Ranch is refused with a reason rather than guessed at, and `hospitablePropertyFor('ranch')` returns null.
 */
import type { HouseId } from './types';
import { RIVER_UNIT_DETAIL, type RiverUnitId } from '../river-units';

/** The whole-house listings, plus the three Riverhouse parts. */
export type HospitableListing = HouseId | RiverUnitId;

const WHOLE_HOUSE: Partial<Record<HouseId, string>> = {
  lindon: '0d57d130-804d-459a-9c96-38cd4d3ea245',
  river: '012e8f6e-ff41-4619-b039-bf92d12d94ab',
  /*
   * `ranch` is deliberately absent. The Ranch House is not a property in this Hospitable account — the owner checked on
   * 2026-11-10 — so there is no uuid to write to and inventing one would send a price to a stranger's calendar.
   */
};

/** The parts, mapped by their Riverhouse listing id, which is what the unit table already holds. */
const PARTS: Record<RiverUnitId, string> = {
  'main-lodge': 'd73579bd-8609-47c0-b23d-b6bb1ab2b286',
  'recreation-wing': '1cc29e25-2781-4e57-8c4e-b0b0f6aa4dbb',
  'garage-suite': '9694ff9e-6679-4d01-91e7-e6dcd3ef6735',
};

/**
 * The uuid for a listing, or null when this account has no such property.
 *
 * Also accepts a raw uuid so a caller that already holds one does not have to re-map it.
 */
export function hospitablePropertyFor(listing: HospitableListing | string): string | null {
  if ((RIVER_UNIT_DETAIL as readonly { id: string }[]).some((unit) => unit.id === listing)) {
    return PARTS[listing as RiverUnitId];
  }
  const whole = WHOLE_HOUSE[listing as HouseId];
  if (whole) return whole;
  // Already a uuid (any of the five), so it is passed through.
  return Object.values(WHOLE_HOUSE).includes(listing) || Object.values(PARTS).includes(listing) ? listing : null;
}

/** Listings with no property in this account, so a caller can say why rather than fail mysteriously. */
export function hospitableMissing(): string[] {
  return ['ranch'];
}

/** One line naming what is mapped, for a status read. */
export function hospitableMapLine(): string {
  const whole = Object.entries(WHOLE_HOUSE).map(([house]) => house);
  return (
    `Hospitable properties: ${whole.join(', ')} whole house plus the three Riverhouse parts (${Object.keys(PARTS).join(', ')}). ` +
    'The Ranch House is not in this Hospitable account, so a Ranch push is refused rather than guessed.'
  );
}
