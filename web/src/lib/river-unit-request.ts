import { RIVER_UNIT_DETAIL, RIVER_UNITS, isRiverUnitId, type RiverUnitId, type UnitSpan } from './river-units';
import { sellableUnits, unitRateState, type RiverUnitRates } from './river-unit-rates';
import { SLEEPS } from './house-stay';

/**
 * Whether a guest's request to stay in part of the Riverhouse can be taken.
 *
 * This is the gate the booking route calls before it saves anything. It answers three things the blocking rules
 * alone cannot:
 *
 *   1. Are the requested parts free for every night asked for?
 *   2. Is each requested part actually sellable — that is, does it carry a price? An unpriced part must never be
 *      offered, because the alternative is quoting a guest a number nobody chose.
 *   3. Does the party fit the parts, and is the combination one we accept?
 *
 * **A part is not a house.** Two parts together is *one* reservation covering both, which is why the answer carries
 * the resolved unit list rather than a house and a flag. Nothing here decides a price; the caller quotes from that
 * list.
 */

export type UnitRequest = {
  /** Which parts of the house are wanted. Empty means the whole house. */
  units?: readonly string[];
  checkIn: string;
  checkOut: string;
  /** Overnight guests. Used only to check the parts can hold them. */
  guests?: number;
};
export type UnitRequestCheck =
  | {
      ok: true;
      /** One entry when the whole house is wanted; one entry per part otherwise. */
      spans: Array<{ units: RiverUnitId[]; wholeHouse: boolean }>;
      /** The parts resolved, in canonical order. Empty when the whole house is wanted. */
      units: RiverUnitId[];
      /** True when this request is for the house rather than any part. */
      wholeHouse: boolean;
      /** How many guests the requested parts can hold, and how many were asked for. */
      sleeps: number;
      guests: number;
      /** One line naming what is being held, for the guest and the host desk. */
      line: string;
    }
  | { ok: false; reason: string; code: UnitRequestCode };

export type UnitRequestCode =
  | 'bad-dates'
  | 'unknown-unit'
  | 'unpriced'
  | 'taken'
  | 'closed'
  | 'over-capacity'
  | 'no-guests'
  | 'stale';

const NAME = new Map(RIVER_UNIT_DETAIL.map((unit) => [unit.id, unit.name]));

/** Read the units a guest asked for, refusing a name we do not sell. */
function readUnits(raw: readonly string[] | undefined): { ok: true; units: RiverUnitId[] } | { ok: false; reason: string } {
  if (!raw || raw.length === 0) return { ok: true, units: [] };
  const out: RiverUnitId[] = [];
  for (const value of raw) {
    if (!isRiverUnitId(value)) {
      return { ok: false, reason: 'That is not one of the three parts of the Riverhouse.' };
    }
    if (!out.includes(value)) out.push(value);
  }
  // Canonical order, so two requests for the same parts always describe them the same way.
  return { ok: true, units: RIVER_UNITS.filter((unit) => out.includes(unit)) };
}

/** The nights a part is already sold, given the stays already on the books. */
function takenNights(spans: readonly UnitSpan[], units: readonly RiverUnitId[], checkIn: string, checkOut: string): string[] {
  const wanted = new Set(units);
  const taken = new Set<string>();
  for (const span of spans) {
    if (span.status === 'cancelled') continue;
    if (span.propertyId !== 'river') continue;
    if (!span.checkIn || !span.checkOut || span.checkOut <= span.checkIn) continue;
    /*
     * A stay with no `units` is the whole house, and it blocks every part. That is what every existing booking
     * means, so this needs no migration and no special case.
     */
    const occupies = span.wholeHouse || !span.units || span.units.length === 0 ? new Set(RIVER_UNITS) : new Set(span.units);
    const overlaps = [...wanted].some((unit) => occupies.has(unit));
    if (!overlaps) continue;
    let cursor = span.checkIn > checkIn ? span.checkIn : checkIn;
    const stop = span.checkOut < checkOut ? span.checkOut : checkOut;
    while (cursor < stop) {
      taken.add(cursor);
      cursor = nextDay(cursor);
    }
  }
  return [...taken].sort();
}
function nextDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

/**
 * Check a request to stay in part of the Riverhouse, or the whole of it.
 *
 * Whole-house requests resolve to a single whole-house span, so they keep the existing behaviour exactly: the house
 * is blocked as a house, not as three parts that happen to add up.
 */
export function unitRequestCheck(
  spans: readonly UnitSpan[],
  rates: RiverUnitRates,
  request: UnitRequest,
  blocks: readonly UnitSpan[] = [],
): UnitRequestCheck {
  const { checkIn, checkOut } = request;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut) || checkOut <= checkIn) {
    return { ok: false, reason: 'This stay is not quoted.', code: 'bad-dates' };
  }
  const read = readUnits(request.units);
  if (!read.ok) return { ok: false, reason: read.reason, code: 'unknown-unit' };

  const guests = typeof request.guests === 'number' && Number.isInteger(request.guests) && request.guests >= 1 ? request.guests : 0;

  /*
   * A closed stretch is not a booking, so it gets its own answer. A host who blocked the house for maintenance should
   * not read that a guest has it, and the guest should not be told the dates are taken when nobody holds them.
   */
  const closed = takenNights(blocks, read.units.length === 0 ? [...RIVER_UNITS] : read.units, checkIn, checkOut);
  if (closed.length > 0) {
    return { ok: false, reason: `The house is closed on ${closed[0]}.`, code: 'closed' };
  }

  // No parts named means the whole house, which is the default the spec asks for.
  if (read.units.length === 0) {
    const taken = takenNights(spans, [...RIVER_UNITS], checkIn, checkOut);
    if (taken.length > 0) {
      return {
        ok: false,
        reason: `The River House is already booked on ${taken[0]}.`,
        code: 'taken',
      };
    }
    return {
      ok: true,
      spans: [{ units: [...RIVER_UNITS], wholeHouse: true }],
      units: [],
      wholeHouse: true,
      sleeps: 24,
      guests,
      line: 'The whole River House.',
    };
  }

  /*
   * A part with no price is not sellable. Refusing here is the whole point of the unset state: the alternative is
   * quoting a guest a rate for a listing that has never been priced.
   */
  const sellable = new Set(sellableUnits(rates));
  const unpriced = read.units.filter((unit) => !sellable.has(unit));
  if (unpriced.length > 0) {
    const names = unpriced.map((unit) => NAME.get(unit) ?? unit).join(' and ');
    const state = unpriced.length === 1 ? unitRateState(rates[unpriced[0]!]) : 'partial';
    return {
      ok: false,
      reason:
        state === 'unset'
          ? `${names} has no price yet, so it cannot be booked.`
          : `${names} is not fully priced yet, so it cannot be booked.`,
      code: 'unpriced',
    };
  }

  const taken = takenNights(spans, read.units, checkIn, checkOut);
  if (taken.length > 0) {
    const names = read.units.map((unit) => NAME.get(unit) ?? unit).join(' and ');
    return { ok: false, reason: `${names} is already booked on ${taken[0]}.`, code: 'taken' };
  }

  const partsSleep = read.units.reduce((sum, unit) => sum + (RIVER_UNIT_DETAIL.find((detail) => detail.id === unit)?.sleeps ?? 0), 0);
  /*
   * The parts sum to one more than the house: 4 + 8 + 13 = 25 against a 24-guest house. Booking every part *is* the
   * whole house, so it cannot sleep more people than the house itself may hold — otherwise a party of 25 could take the
   * entire building as "three parts" while the same 25 is refused as a whole-house booking.
   *
   * The cap is the house's published capacity, not the sum, so the two routes agree. Which number is right is the
   * host's call; until they settle it, the stricter of the two wins, because overfilling a house is not recoverable and
   * a refused party can book the other way.
   */
  const houseSleeps = SLEEPS.river;
  const sleeps = read.units.length === RIVER_UNITS.length ? Math.min(partsSleep, houseSleeps) : partsSleep;
  if (guests > 0 && guests > sleeps) {
    const names = read.units.map((unit) => NAME.get(unit) ?? unit).join(' and ');
    return {
      ok: false,
      reason:
        read.units.length === RIVER_UNITS.length && partsSleep > houseSleeps
          ? `All three parts are the whole house, which sleeps ${sleeps}. This party is ${guests}.`
          : `${names} sleeps ${sleeps}, and this party is ${guests}.`,
      code: 'over-capacity',
    };
  }

  return {
    ok: true,
    /*
     * One span carrying every requested part. That is what makes two parts together a single reservation: one
     * booking blocks the house and both parts, and leaves the third sellable.
     */
    spans: [{ units: read.units, wholeHouse: false }],
    units: read.units,
    wholeHouse: false,
    sleeps,
    guests,
    line: `${read.units.map((unit) => NAME.get(unit) ?? unit).join(' and ')}.`,
  };
}

/**
 * What a guest can actually be offered on a given night, and why the rest is unavailable.
 *
 * The booking page uses this so that a part is never shown as available without a price behind it. `reasons` exists
 * because "unavailable" and "not priced yet" are different answers, and a guest who asks about a part deserves the
 * real one.
 */
export type UnitOffer = {
  unit: RiverUnitId;
  name: string;
  sleeps: number;
  /** The guest nightly rate, or null when the part has no price. */
  nightly: number | null;
  /** True only when the part is priced *and* every night asked for is free. */
  available: boolean;
  /** Why it cannot be booked, or null when it can. */
  reason: string | null;
};

export function unitOffers(
  spans: readonly UnitSpan[],
  rates: RiverUnitRates,
  checkIn: string,
  checkOut: string,
  blocks: readonly UnitSpan[] = [],
): UnitOffer[] {
  const goodDates = /^\d{4}-\d{2}-\d{2}$/.test(checkIn) && /^\d{4}-\d{2}-\d{2}$/.test(checkOut) && checkOut > checkIn;
  return RIVER_UNIT_DETAIL.map((unit) => {
    const state = unitRateState(rates[unit.id]);
    const nightly = state === 'ready' ? rates[unit.id].nightly : null;
    if (state !== 'ready') {
      return {
        unit: unit.id,
        name: unit.name,
        sleeps: unit.sleeps,
        nightly: null,
        available: false,
        reason:
          state === 'unset'
            ? 'This part has no price yet, so it cannot be booked.'
            : 'This part is not fully priced yet, so it cannot be booked.',
      };
    }
    if (!goodDates) {
      return { unit: unit.id, name: unit.name, sleeps: unit.sleeps, nightly, available: false, reason: null };
    }
    const closed = takenNights(blocks, [unit.id], checkIn, checkOut);
    if (closed.length > 0) {
      return {
        unit: unit.id,
        name: unit.name,
        sleeps: unit.sleeps,
        nightly,
        available: false,
        reason: `The house is closed on ${closed[0]}.`,
      };
    }
    const taken = takenNights(spans, [unit.id], checkIn, checkOut);
    return {
      unit: unit.id,
      name: unit.name,
      sleeps: unit.sleeps,
      nightly,
      available: taken.length === 0,
      reason: taken.length === 0 ? null : `Booked on ${taken[0]}.`,
    };
  });
}
