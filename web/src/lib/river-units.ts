import { addDays } from './market/dates';
import type { HouseId } from './market/types';

/**
 * The Provo Riverhouse can be sold whole or as three separate units.
 *
 * This is one physical house with four ways to sell the same nights, so the only thing that matters is that a
 * night is **never sold twice**. Everything here derives from the same `StaySpan` list the rest of the app already
 * uses (`availability.ts`), so there is no second calendar and no second truth: a stay occupying `river` blocks all
 * three units, and a stay occupying a unit blocks the house.
 *
 * **Units are not a fourth `HouseId`.** `HouseId` is used in about a hundred files and means "a physical house" —
 * owner split, cleaning, portfolio revenue, comps. Adding `river-garage` to it would silently put a unit into every
 * three-house calculation. A unit is a *part of* `river`, carried on the stay span as extra fields.
 */

export const RIVER_UNITS = ['garage-suite', 'recreation-wing', 'main-lodge'] as const;
export type RiverUnitId = (typeof RIVER_UNITS)[number];

/**
 * The three units, from the unpublished Airbnb drafts (verified 2026-11-08), corrected by the owner 2026-11-10.
 *
 * Capacities sum to **22**, which is what the whole house sleeps — 4 + 8 + 10. The first spec had the Main Lodge at 13 and
 * the house at 24, so the parts summed to 25 against a 24-guest house and a party of 25 could not book either way. The owner
 * resolved it on Nov 10: the Main Lodge sleeps 10 (the expandable king and triple twin bunk are not in the house), so the
 * two figures now agree and a 22-guest group can book whole or in parts.
 */
export type RiverUnit = {
  id: RiverUnitId;
  name: string;
  size: 'small' | 'medium' | 'large';
  sleeps: number;
  bedrooms: number;
  beds: number;
  baths: number;
  /** The Airbnb draft listing this unit corresponds to. Not published yet. */
  airbnbListingId: string;
};

export const RIVER_UNIT_DETAIL: readonly RiverUnit[] = [
  {
    id: 'garage-suite',
    name: 'River Garage Suite',
    size: 'small',
    sleeps: 4,
    bedrooms: 1,
    beds: 2,
    baths: 1,
    airbnbListingId: '1812283450038869543',
  },
  {
    id: 'recreation-wing',
    name: 'River Recreation Wing',
    size: 'medium',
    /*
     * Three king suites plus the loft, and the owner counts the loft as a bedroom — so four bedrooms, not three. The loft
     * holds two single beds, which is where the other two of the eight come from.
     */
    sleeps: 8,
    bedrooms: 4,
    beds: 5,
    baths: 3,
    airbnbListingId: '1812281461584611574',
  },
  {
    id: 'main-lodge',
    name: 'River Main Lodge',
    size: 'large',
    /*
     * Ten, from four king suites — and one of those rooms, the bunk room, also holds a bunk bed, which is where the other
     * two of the ten come from. Three full baths. **Do not add a fifth bedroom.**
     *
     * **Six beds**, and the spec's own sleeps figure is what settles it: four kings sleep 8, and the part sleeps 10, so the
     * bunk adds 2 guests — which is a twin-over-twin, two beds. I had 5 here from counting "one bunk" as one bed, which would
     * have meant a bunk sleeping two people in one bed.
     *
     * The first spec had 13 beds with an expandable king and a triple twin bunk that are not in this part; the owner corrected
     * the capacity on 2026-11-10.
     */
    sleeps: 10,
    bedrooms: 4,
    beds: 6,
    baths: 3,
    airbnbListingId: '1812276294765596083',
  },
];

export function isRiverUnitId(value: unknown): value is RiverUnitId {
  return typeof value === 'string' && (RIVER_UNITS as readonly string[]).includes(value);
}

/**
 * Anything the app already treats as a stay, plus which parts of the Riverhouse it occupies.
 *
 * Absent `units` on a `river` stay means the **whole house** — that is what every existing reservation means, and it
 * is why the existing bookings keep blocking all three units without any migration.
 */
export type UnitSpan = {
  propertyId: string;
  checkIn: string;
  checkOut: string;
  status?: string;
  /** Only meaningful for `propertyId === 'river'`. Empty means the whole house. */
  units?: readonly RiverUnitId[];
  /** A whole-house stay. Explicit so a block and a cancellation read the same way as a booking. */
  wholeHouse?: boolean;
};

/** Which parts of the Riverhouse a stay occupies. A whole-house stay occupies all three. */
export function unitsTakenBy(span: UnitSpan): RiverUnitId[] {
  if (span.propertyId !== 'river') return [];
  const listed = (span.units ?? []).filter(isRiverUnitId);
  if (span.wholeHouse || listed.length === 0) return [...RIVER_UNITS];
  return [...new Set(listed)];
}

/** A stay that is cancelled occupies nothing. */
function live(span: UnitSpan): boolean {
  if (span.status === 'cancelled') return false;
  return Boolean(span.checkIn) && Boolean(span.checkOut) && span.checkOut > span.checkIn;
}

/** The nights a span covers, clipped to a window. */
function nightsIn(span: UnitSpan, from: string, until: string): string[] {
  const out: string[] = [];
  let cursor = span.checkIn > from ? span.checkIn : from;
  const stop = span.checkOut < until ? span.checkOut : until;
  while (cursor < stop) {
    out.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return out;
}

/** Nights on which this unit is already sold, for any reason. */
export function unitBlockedNights(spans: readonly UnitSpan[], unit: RiverUnitId, from: string, until: string): string[] {
  const taken = new Set<string>();
  for (const span of spans) {
    if (!live(span)) continue;
    if (!unitsTakenBy(span).includes(unit)) continue;
    for (const night of nightsIn(span, from, until)) taken.add(night);
  }
  return [...taken].sort();
}

/** Nights on which the whole house is sold — either as the house, or by any unit taking any night. */
export function wholeHouseBlockedNights(spans: readonly UnitSpan[], from: string, until: string): string[] {
  const taken = new Set<string>();
  for (const span of spans) {
    if (!live(span)) continue;
    // Rule 2 and rule 5: any unit on any night blocks the whole house for that night.
    if (span.propertyId !== 'river') continue;
    for (const night of nightsIn(span, from, until)) taken.add(night);
  }
  return [...taken].sort();
}

export type RiverAvailability = {
  /** Nights the whole house can be sold. */
  wholeHouse: string[];
  /** Per unit, the nights it can be sold. */
  units: Record<RiverUnitId, string[]>;
  /** Per night, how many units are still free. Used by the split decision. */
  freeUnitsByNight: Record<string, number>;
};

/**
 * Everything about the Riverhouse's sellability in a window, computed in one pass from one stay list.
 *
 * This is the function the truth table in the spec describes, and the acceptance tests assert against it.
 */
export function riverAvailability(
  spans: readonly UnitSpan[],
  from: string,
  until: string,
): RiverAvailability {
  const whole = new Set(riverNights(from, until));
  const perUnit = Object.fromEntries(RIVER_UNITS.map((unit) => [unit, new Set(riverNights(from, until))])) as Record<
    RiverUnitId,
    Set<string>
  >;

  for (const span of spans) {
    if (!live(span) || span.propertyId !== 'river') continue;
    const nights = nightsIn(span, from, until);
    // Any Riverhouse stay blocks the whole house: rule 1 (whole booked) and rule 2 (any unit booked).
    for (const night of nights) whole.delete(night);
    for (const unit of unitsTakenBy(span)) {
      for (const night of nights) perUnit[unit].delete(night);
    }
  }

  const units = Object.fromEntries(
    RIVER_UNITS.map((unit) => [unit, [...perUnit[unit]].sort()]),
  ) as Record<RiverUnitId, string[]>;

  const freeUnitsByNight: Record<string, number> = {};
  for (const night of riverNights(from, until)) {
    freeUnitsByNight[night] = RIVER_UNITS.filter((unit) => perUnit[unit].has(night)).length;
  }

  return { wholeHouse: [...whole].sort(), units, freeUnitsByNight };
}

/** Every night in a window, so each set starts "free" and stays are removed from it. */
function riverNights(from: string, until: string): string[] {
  const out: string[] = [];
  let cursor = from;
  while (cursor < until) {
    out.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return out;
}

/**
 * Whether a proposed booking is allowed against the current spans.
 *
 * Returns the first reason it is not, or null when it is. Deliberately checks the *specific* parts requested rather
 * than the house: two units together is one booking covering both, and the remaining unit stays sellable.
 */
export function unitBookingConflict(
  spans: readonly UnitSpan[],
  request: { units: readonly RiverUnitId[]; checkIn: string; checkOut: string },
  from: string,
  until: string,
): { unit: RiverUnitId; night: string } | null {
  if (request.checkIn >= request.checkOut) return null;
  const wanted = request.units.length === 0 ? [...RIVER_UNITS] : request.units;
  for (const unit of wanted) {
    const blocked = new Set(unitBlockedNights(spans, unit, from, until));
    for (const night of nightsIn({ propertyId: 'river', checkIn: request.checkIn, checkOut: request.checkOut }, from, until)) {
      if (blocked.has(night)) return { unit, night };
    }
  }
  return null;
}

export type { HouseId };

/**
 * The parts of the house another party already holds on these nights.
 *
 * Used for one thing: telling the host, at the moment they accept a part booking, that a second party will be in the
 * building. The building has one door code, so that is a real consequence rather than a detail.
 *
 * Only parts **not** being taken by this booking are reported — the parts being sold here are the guest's own, and
 * naming them back would read as if they were somebody else's. Returns part names, never a guest.
 */
export function otherPartsOccupied(
  spans: readonly UnitSpan[],
  request: { units: readonly RiverUnitId[]; checkIn: string; checkOut: string },
  from: string,
  until: string,
): string[] {
  if (request.checkIn >= request.checkOut) return [];
  const ours = new Set(request.units.length === 0 ? RIVER_UNITS : request.units);
  const nights = nightsIn({ propertyId: 'river', checkIn: request.checkIn, checkOut: request.checkOut }, from, until);
  if (nights.length === 0) return [];

  const occupied: string[] = [];
  for (const unit of RIVER_UNITS) {
    if (ours.has(unit)) continue;
    const blocked = new Set(unitBlockedNights(spans, unit, from, until));
    if (nights.some((night) => blocked.has(night))) {
      occupied.push(RIVER_UNIT_DETAIL.find((detail) => detail.id === unit)?.name ?? unit);
    }
  }
  return occupied;
}
