import { RIVER_UNIT_DETAIL, RIVER_UNITS, type RiverUnitId } from './river-units';

/**
 * What a guest who booked **part** of the Riverhouse needs to be told.
 *
 * A part booking is a real stay in a real house, but the house is also sold to other guests at the same time. A portal
 * that says nothing about that is how a guest walks into the Recreation Wing and treats it as theirs, or wonders why
 * the Main Lodge door is locked. Silence is the defect; this module is the sentence.
 *
 * Rules the copy holds:
 *
 *  - It names the part, so the guest knows what they rented.
 *  - It says plainly that the rest of the house may be occupied, because it may be.
 *  - It never names the other guests, and never hints at who they are.
 *  - It never promises the shared areas are private, and never promises they are not: on a whole-house booking they
 *    are the guest's, on a part booking they are not.
 */

export type PartStay = {
  /** The parts this stay occupies, already narrowed to real ids. Empty means the whole house. */
  units: RiverUnitId[];
  /** How many guests the booked parts sleep. */
  sleeps: number;
  /** The part names, in canonical order. */
  names: string[];
  /** True when this is the whole house, which is every stay recorded before parts existed. */
  wholeHouse: boolean;
};

/** Read the parts off a stay, dropping anything that is not a real part. */
export function partStayFrom(units: readonly string[] | undefined): PartStay {
  const listed = (units ?? []).filter((unit): unit is RiverUnitId => (RIVER_UNITS as readonly string[]).includes(unit));
  const ordered = RIVER_UNIT_DETAIL.filter((detail) => listed.includes(detail.id));
  if (ordered.length === 0) {
    return { units: [], sleeps: 24, names: [], wholeHouse: true };
  }
  return {
    units: ordered.map((detail) => detail.id),
    sleeps: ordered.reduce((sum, detail) => sum + detail.sleeps, 0),
    names: ordered.map((detail) => detail.name),
    wholeHouse: false,
  };
}

/**
 * The line a part guest reads at the top of their stay.
 *
 * Null for a whole-house stay: there is nothing to explain, and a line that appeared on every booking would train a
 * guest to ignore it.
 */
export function partStayLine(stay: PartStay): string | null {
  if (stay.wholeHouse) return null;
  const names = listNames(stay.names);
  const rest = RIVER_UNIT_DETAIL.filter((detail) => !stay.units.includes(detail.id)).map((detail) => detail.name);
  const shared =
    rest.length === 0
      ? 'You have every part of the house.'
      : `The rest of the house (${listNames(rest)}) may be booked by other guests while you are here.`;
  return `This stay is for ${names}. It sleeps ${stay.sleeps}. ${shared}`;
}

/**
 * The one thing a part guest most needs to know before they arrive, and the reason it matters.
 *
 * A guest who books a part and expects a 24-guest house will arrive annoyed. Saying the capacity out loud is the whole
 * point of this line.
 */
export function partStayCapacityLine(stay: PartStay): string | null {
  if (stay.wholeHouse) return null;
  const names = listNames(stay.names);
  return `${names} sleeps ${stay.sleeps}, not the whole house's 24.`;
}

/**
 * A label for the stay sheet, so a guest's own record says what they rented.
 *
 * Null for the whole house, because "The River House" already says it and a suffix on every booking is noise.
 */
export function partStayLabel(stay: PartStay): string | null {
  if (stay.wholeHouse) return null;
  return listNames(stay.names);
}

/**
 * Whether a shared-amenity line may be shown to this guest.
 *
 * Some lines are true of the whole house and false of a part — anything that assumes the guest has the run of the
 * building. Rather than trying to rewrite every amenity, the caller asks this and withholds the ones that would be a
 * promise we cannot keep.
 */
export function partGuestHasWholeHouse(stay: PartStay): boolean {
  return stay.wholeHouse;
}

/** "A", "A and B", "A, B, and C". */
function listNames(names: readonly string[]): string {
  const short = names.map((name) => name.replace(/^River /, ''));
  if (short.length === 0) return '';
  if (short.length === 1) return short[0]!;
  if (short.length === 2) return `${short[0]} and ${short[1]}`;
  return `${short.slice(0, -1).join(', ')}, and ${short[short.length - 1]}`;
}

/**
 * House notes with the capacity-bearing ones rewritten for a part guest.
 *
 * The River guide's Bedrooms note reads "Seven king suites, each in its own room, plus an expandable king." A guest in the
 * Garage Suite has one bedroom and two beds, so that sentence describes rooms they did not rent — the same contradiction
 * the published rule had, in the body of the guide instead of the rules.
 *
 * Only notes that claim a whole-house count are replaced. Everything true of the part stays as written: the septic note,
 * the river-safety note, and anything the host typed that does not count rooms.
 *
 * A whole-house stay is returned untouched, so nothing changes for those guests.
 */
export function partHouseNotes<T extends { title: string; body: string }>(
  stay: PartStay,
  notes: readonly T[],
): T[] {
  if (stay.wholeHouse) return [...notes];
  return notes.map((note) => {
    /*
     * A note is only rewritten when it actually counts the house — "seven king suites", "sleeps 24", or "the whole
     * house". A note that merely says "the house is on septic" is true of a part and must not be touched.
     */
    const claimsWholeHouse = /\bseven king suites\b|\bsleeps 24\b|\bwhole house\b|\bexpandable king\b/i.test(`${note.title} ${note.body}`);
    if (!claimsWholeHouse) return note;
    const label = listNames(stay.names);
    const parts = RIVER_UNIT_DETAIL.filter((detail) => stay.units.includes(detail.id));
    const counts = parts.map((detail) => `${detail.bedrooms} bedroom${detail.bedrooms === 1 ? '' : 's'} and ${detail.beds} bed${detail.beds === 1 ? '' : 's'}`).join(', ');
    const replaced = `${label}: ${counts}, sleeping ${stay.sleeps}. The rest of the house is not part of this stay.`;
    return { ...note, body: replaced };
  });
}
