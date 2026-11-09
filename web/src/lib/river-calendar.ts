import { RIVER_UNITS, type RiverUnitId } from './river-units';
import { RIVER_UNIT_DETAIL } from './river-units';

/**
 * One day at the Riverhouse, seen as four sellable things at once.
 *
 * The host's question is not "is the house booked" — it is *what is still sellable on this date, and why not the rest.*
 * A whole-house stay, a single part, two parts together, and a calendar block all look identical on a house calendar,
 * and the difference decides whether a night can still be sold. So each day carries the parts taken, the parts free,
 * and a line that names the reason.
 *
 * Nothing here reads storage. It is given the stays and blocks the host page already has.
 */

export type RiverPartState = {
  unit: RiverUnitId;
  name: string;
  taken: boolean;
};

export type RiverDay = {
  date: string;
  /** Days of the month, as a number, for placing in a grid. */
  day: number;
  /**
   * True when the house can no longer be sold whole — which happens as soon as **any** part is taken, not only when all
   * three are. This is the rule the whole split rests on: one part sold blocks the house.
   */
  houseTaken: boolean;
  /** True when all three parts are taken, however that happened. */
  wholeHouseSold: boolean;
  /** True when the host closed the date rather than a guest taking it. */
  closed: boolean;
  /** Every part, with whether it is sold that night. */
  parts: RiverPartState[];
  /** Parts still sellable that night. */
  freeParts: RiverUnitId[];
  /**
   * One line naming why this night is where it is. Always says something: a night with every part free says so, because
   * a blank cell reads as "no data" rather than "open".
   */
  reason: string;
};

export type RiverDayInput = {
  /** A stay or a block, as the host page already holds them. */
  propertyId: string;
  checkIn: string;
  checkOut: string;
  status?: string;
  units?: readonly string[];
  /** A calendar block, which is closed rather than booked. */
  blocked?: boolean;
};

function isPart(value: unknown): value is RiverUnitId {
  return typeof value === 'string' && (RIVER_UNITS as readonly string[]).includes(value);
}

/** True when this span occupies the part on this night. A span with no parts is the whole house. */
function occupiesOn(span: RiverDayInput, date: string): { house: boolean; parts: RiverUnitId[] } | null {
  if (span.status === 'cancelled') return null;
  if (span.propertyId !== 'river') return null;
  if (!span.checkIn || !span.checkOut || span.checkOut <= span.checkIn) return null;
  // A stay covers nights from check-in up to but not including check-out.
  if (date < span.checkIn || date >= span.checkOut) return null;
  const listed = (span.units ?? []).filter(isPart);
  /*
   * No parts listed is the whole house. That is what every stay recorded before parts existed means, so it blocks all
   * three — and a block with no parts closes all three for the same reason.
   */
  if (listed.length === 0) return { house: true, parts: [...RIVER_UNITS] };
  return { house: true, parts: listed };
}

/** Every day of a month at the Riverhouse, with the parts taken and the reason. */
export function riverMonth(
  month: string,
  spans: readonly RiverDayInput[],
  todayIso = '',
): RiverDay[] {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return [];
  const daysInMonth = new Date(y, m, 0).getDate();
  const out: RiverDay[] = [];
  for (let d = 1; d <= daysInMonth; d += 1) {
    const date = `${month}-${String(d).padStart(2, '0')}`;
    const taken = new Set<RiverUnitId>();
    let closed = false;
    let booked = false;
    for (const span of spans) {
      const occupies = occupiesOn(span, date);
      if (!occupies) continue;
      // A block closes the night; a stay sells it. Both take the parts they name.
      if (span.blocked) closed = true;
      else booked = true;
      for (const part of occupies.parts) taken.add(part);
    }
    const parts: RiverPartState[] = RIVER_UNIT_DETAIL.map((unit) => ({
      unit: unit.id,
      name: unit.name,
      taken: taken.has(unit.id),
    }));
    const freeParts = RIVER_UNITS.filter((unit) => !taken.has(unit));
    /*
     * The house is unsellable as a house the moment *one* part is taken, because a whole-house guest would be in the
     * same rooms. `wholeHouseSold` is the narrower fact — every part gone — and the line says which it is.
     */
    const wholeHouseSold = taken.size === RIVER_UNITS.length;
    const houseTaken = taken.size > 0;
    out.push({
      date,
      day: d,
      houseTaken,
      wholeHouseSold,
      closed,
      parts,
      freeParts,
      reason: riverDayReason({ wholeHouseSold, closed, taken, freeParts, booked, isToday: date === todayIso }),
    });
  }
  return out;
}

function nameOf(unit: RiverUnitId): string {
  return RIVER_UNIT_DETAIL.find((detail) => detail.id === unit)?.name.replace('River ', '') ?? unit;
}

/** One line that names what is sold, what is free, and which of the two applies. */
function riverDayReason(input: {
  wholeHouseSold: boolean;
  closed: boolean;
  taken: Set<RiverUnitId>;
  freeParts: readonly RiverUnitId[];
  booked: boolean;
  isToday: boolean;
}): string {
  /*
   * Closed is checked before booked, because a host who blocked the house for maintenance should not read that a guest
   * has it. When both are true the honest answer names both.
   */
  if (input.closed && input.booked) return 'Closed, and a stay is on these nights.';
  if (input.closed) return 'Closed by the host.';
  if (input.wholeHouseSold) {
    // All three parts gone reads differently from one part gone.
    return input.booked ? 'Whole house sold.' : 'Not sellable.';
  }
  if (input.taken.size === 0) {
    return input.isToday ? 'Open tonight: all three parts free.' : 'Open: all three parts free.';
  }
  const sold = [...input.taken].map(nameOf);
  const free = input.freeParts.map(nameOf);
  return `${sold.join(' and ')} sold, ${free.join(' and ')} still open.`;
}

/**
 * The month in one sentence, for the panel heading.
 *
 * It counts nights that can still be sold somewhere — the whole house or at least one part — because that is the number
 * a host acts on. A night with one part left is not a lost night.
 */
export function riverMonthLine(days: readonly RiverDay[]): string {
  if (days.length === 0) return 'No days to show.';
  // A night sells whole only while the whole house is free, which means no part is taken.
  const openHouse = days.filter((day) => !day.houseTaken && !day.closed).length;
  // A night that can only be sold as a part: something is taken, but a part is still free.
  const openPart = days.filter((day) => !day.closed && day.freeParts.length > 0 && day.freeParts.length < RIVER_UNITS.length).length;
  const closed = days.filter((day) => day.closed).length;
  const soldOut = days.filter((day) => day.wholeHouseSold && !day.closed).length;
  const parts: string[] = [];
  parts.push(openHouse === 1 ? '1 night sells whole' : `${openHouse} nights sell whole`);
  if (openPart > 0) parts.push(openPart === 1 ? '1 sells as a part' : `${openPart} sell as a part`);
  if (soldOut > 0) parts.push(soldOut === 1 ? '1 is fully sold' : `${soldOut} are fully sold`);
  if (closed > 0) parts.push(closed === 1 ? '1 is closed' : `${closed} are closed`);
  return `${parts.join(', ')}.`;
}
