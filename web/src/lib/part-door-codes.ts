/**
 * Which door code a stay's guest is shown.
 *
 * The River House used to have **one code for the whole building**, so a guest in the Garage Suite held a code that opened the
 * Main Lodge where a different guest might be staying. The owner's answer on 2026-11-10 settles it: separate codes when parts
 * are booked separately, one code when the whole house is booked.
 *
 * Three rules keep this from becoming a way to hand out someone else's door:
 *
 *   1. **A part stay gets only its own part's codes.** Two parts sold together get both, because one reservation holds both. A
 *      part stay never receives the code for a part it did not book.
 *   2. **A whole-house stay gets the house code**, exactly as before the split, so no existing stay changes.
 *   3. **A part with no code set is named as missing**, never filled from the house code. One code opens the building, which is
 *      exactly what a separately-booked part must not receive.
 */
import { RIVER_UNIT_DETAIL, type RiverUnitId } from './river-units';

/**
 * Door codes by part, for the River House.
 *
 * Absent means the part has no code of its own yet. That is a real state and the guest is told the code is not set, because
 * falling back to the house code would open every part.
 */
export type PartDoorCodes = Partial<Record<RiverUnitId, string>>;

export type DoorPlan = {
  /** The codes to show, in the order they should be listed. Empty when nothing can be shown. */
  codes: Array<{ label: string; code: string }>;
  /** When the guest must be told a code is missing, and what to say. Null when nothing is missing. */
  missing: string | null;
};

/** Is this stay part of the house rather than the whole of it? */
export function isPartStay(units: readonly string[] | undefined): boolean {
  return Array.isArray(units) && units.length > 0;
}

/**
 * The door codes for one stay.
 *
 * `units` absent means the whole house, which is what every stay recorded before the split means — so those guests keep
 * getting the single house code and nothing about them changes.
 */
export function doorCodesForStay(input: {
  house: string;
  units?: readonly string[];
  /** The whole-house code, which is also the only code this app had before the split. */
  houseCode: string;
  /** Codes per part, when the host has set them. */
  partCodes?: PartDoorCodes;
}): DoorPlan {
  const houseCode = (input.houseCode ?? '').trim();
  const parts = (input.units ?? []).filter((unit): unit is RiverUnitId =>
    (RIVER_UNIT_DETAIL as readonly { id: string }[]).some((detail) => detail.id === unit),
  );

  // Not a part stay: the whole house, exactly as before.
  if (parts.length === 0) {
    return {
      codes: houseCode ? [{ label: 'Door code', code: houseCode }] : [],
      missing: null,
    };
  }

  const codes: Array<{ label: string; code: string }> = [];
  const missingNames: string[] = [];
  for (const part of parts) {
    const name = RIVER_UNIT_DETAIL.find((detail) => detail.id === part)?.name ?? part;
    const code = (input.partCodes?.[part] ?? '').trim();
    if (code) codes.push({ label: name, code });
    else missingNames.push(name);
  }

  /*
   * A part with no code of its own is named as missing. The house code is deliberately **not** used as a fallback: it opens
   * every part, so handing it to a guest who booked one part would give them the building.
   */
  const missing =
    missingNames.length === 0
      ? null
      : missingNames.length === 1
        ? `${missingNames[0]} has no door code set yet. Text or call us and we will give you the code for your part — please do not use another part's entrance.`
        : `${missingNames.join(' and ')} have no door codes set yet. Text or call us and we will give you the codes for your parts — please do not use another part's entrance.`;

  return { codes, missing };
}

/**
 * The host-facing warning for the pricing panel, so a missing part code is visible before a price invites a booking.
 *
 * Null when no part has a code at all — a host who has not started selling parts does not need a warning about them.
 */
export function partCodeWarning(partCodes: PartDoorCodes | undefined, houseCode: string): string | null {
  const set = RIVER_UNIT_DETAIL.filter((detail) => (partCodes?.[detail.id] ?? '').trim().length > 0);
  if (set.length === 0) return null;
  const missing = RIVER_UNIT_DETAIL.filter((detail) => !(partCodes?.[detail.id] ?? '').trim().length);
  if (missing.length === 0) {
    return 'Each part has its own door code. A whole-house booking still uses the house code, which opens the building.';
  }
  const names = missing.map((detail) => detail.name).join(' and ');
  return (
    `${names} ${missing.length === 1 ? 'has' : 'have'} no door code yet, so a guest in ${missing.length === 1 ? 'it' : 'them'} ` +
    'is told to call rather than given the house code — that code opens every part. ' +
    `${houseCode.trim() ? 'The whole-house code is still set, so a whole-house booking is unaffected.' : 'No whole-house code is set either.'}`
  );
}
