import { addDays } from './market/dates';
import type { HouseId } from './market/types';
import { RIVER_UNIT_DETAIL } from './river-units';

const NAME: Record<HouseId, string> = {
  river: 'The River House',
  ranch: 'The Ranch House',
  lindon: 'The Lindon House',
};

/** The parts by name, so a host reads "River Main Lodge" rather than a slug. */
const RIVER_UNIT_NAME = new Map(RIVER_UNIT_DETAIL.map((unit) => [unit.id, unit.name]));

function isHouse(id: string): id is HouseId {
  return id === 'river' || id === 'ranch' || id === 'lindon';
}

function shortWhen(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** A direct request as saved by `/book`. Only the fields the inbox reads are named. */
export type BookingRequestRow = {
  id: string;
  name?: string;
  /** Kept so the host can send the confirmation. It is never copied onto a public line. */
  email?: string;
  propertyId?: string;
  alsoPropertyId?: string;
  checkIn?: string;
  checkOut?: string;
  guests?: number;
  children?: number;
  returning?: boolean;
  createdAt?: string;
  note?: string;
  /**
   * Which parts of the Riverhouse this request takes. Absent means the whole house, so every request taken before
   * parts existed still reads as the whole house and blocks all three.
   */
  units?: string[];
};

/** A request is still open until a stay with its dates exists on that house. Nothing is written here. */
export type InboxRow = {
  id: string;
  houses: HouseId[];
  houseLine: string;
  dates: string;
  guests: number | null;
  ageDays: number | null;
  /** True when a saved stay or block already covers these nights on one of the houses. */
  taken: boolean;
  /** True when a stay carrying this request id is already on the books. */
  accepted?: boolean;
  /** True when the host already declined this request. */
  declined?: boolean;
  /** The host's reason, already phrased for a line. */
  declineLine?: string;
  /** True when the request is older than the reply window. It is not called late by the calendar. */
  stale: boolean;
  line: string;
  /**
   * Which parts of the Riverhouse the request takes, already named for a host.
   *
   * Null for a whole-house request, which is every request made before the house was sold in parts. A host must see
   * this before accepting: accepting a part request books only those parts, and the rest of the house stays sellable.
   */
  partLine?: string;
};

const REPLY_DAYS = 2;

function nightList(checkIn: string, checkOut: string): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut)) return [];
  const nights: string[] = [];
  let cursor = checkIn;
  for (let guard = 0; guard < 400 && cursor < checkOut; guard += 1) {
    nights.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return nights;
}

function dayGap(from: string, to: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return null;
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

/**
 * The host inbox. A request is listed with its houses and dates, and it is marked taken when those
 * nights are already on the calendar. Nothing is booked, held, or answered here.
 */
export function bookingInbox(
  requests: readonly BookingRequestRow[],
  taken: Partial<Record<HouseId, readonly string[]>>,
  asOf: string,
  limit = 12,
): InboxRow[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return [];
  const rows: InboxRow[] = [];
  /*
   * The list is capped, so the order decides which requests a host never sees. The route saves
   * newest-first, which meant the cap kept the newest and dropped the *oldest* — exactly the requests
   * that have waited longest. Oldest first, so the cap drops the least urgent.
   */
  const ordered = [...requests].sort((a, b) => {
    const at = (a.createdAt ?? '').slice(0, 10);
    const bt = (b.createdAt ?? '').slice(0, 10);
    if (at !== bt) return at.localeCompare(bt);
    return a.id.localeCompare(b.id);
  });
  for (const request of ordered) {
    const first = isHouse(request.propertyId ?? '') ? (request.propertyId as HouseId) : null;
    if (!first) continue;
    const also = isHouse(request.alsoPropertyId ?? '') && request.alsoPropertyId !== first ? (request.alsoPropertyId as HouseId) : null;
    const houses: HouseId[] = also ? [first, also] : [first];
    const checkIn = request.checkIn ?? '';
    const checkOut = request.checkOut ?? '';
    const nights = nightList(checkIn, checkOut);
    const takenNow =
      nights.length > 0 &&
      houses.some((house) => {
        const booked = new Set(taken[house] ?? []);
        return nights.some((night) => booked.has(night));
      });
    const ageDays = request.createdAt ? dayGap(request.createdAt.slice(0, 10), asOf) : null;
    const guests = typeof request.guests === 'number' && Number.isInteger(request.guests) && request.guests >= 1 ? request.guests : null;
    const houseLine = houses.map((house) => NAME[house]).join(' and ');
    const dates = nights.length > 0 ? `${shortWhen(checkIn)} to ${shortWhen(checkOut)}` : 'no dates';
    const party = guests === null ? 'no party size' : guests === 1 ? '1 guest' : `${guests} guests`;
    const kids =
      typeof request.children === 'number' && request.children > 0
        ? `, including ${request.children === 1 ? '1 child' : `${request.children} children`}`
        : '';
    const state = takenNow ? 'Those nights are already on the calendar.' : 'Those nights are not on the calendar.';
    const line = `${houseLine}, ${dates}, ${party}${kids}. ${state} Nothing is booked.`;
    /*
     * The part request is named separately from the house, because "River" alone would tell a host the whole house is
     * wanted. An empty list or no list means the whole house, which is what every earlier request means.
     */
    const partIds = Array.isArray(request.units) ? request.units.filter((unit) => typeof unit === 'string') : [];
    // Canonical order, so the same parts always read the same way here and on the booking gate.
    const orderedParts = RIVER_UNIT_DETAIL.filter((detail) => partIds.includes(detail.id)).map((detail) => detail.id);
    const unknownParts = partIds.filter((unit) => !orderedParts.includes(unit as never));
    const namedParts = [...orderedParts, ...unknownParts];
    const partLine =
      namedParts.length === 0
        ? undefined
        : `${namedParts.map((unit) => RIVER_UNIT_NAME.get(unit as never) ?? unit).join(' and ')} only, not the whole house.`;
    rows.push({
      id: request.id,
      houses,
      houseLine,
      dates,
      guests,
      ageDays,
      taken: takenNow,
      stale: ageDays !== null && ageDays > REPLY_DAYS,
      line: line.includes('$') ? line.replace(/\$\S+/g, '') : line,
      ...(partLine ? { partLine } : {}),
    });
    if (rows.length >= limit) break;
  }
  return rows;
}

/**
 * How many requests still need a decision. A request that was accepted or declined is answered, so it
 * is not counted as waiting and cannot be called late. No names, and no price.
 *
 * `more` is the number of requests the list did not show. The list is capped so the desk stays
 * readable, and the summary has to say so: without it, twelve answered rows and eight hidden waiting
 * ones read as "all answered", and those eight never get an answer.
 */
export function inboxSummary(rows: readonly InboxRow[], more = 0): string {
  const waiting = rows.filter((row) => !row.accepted && !row.declined);
  const open = waiting.filter((row) => !row.taken);
  const stale = open.filter((row) => row.stale);
  const hidden = Number.isInteger(more) && more > 0 ? more : 0;
  if (rows.length === 0 && hidden === 0) return 'No direct requests are waiting. Nothing is booked.';
  if (waiting.length === 0 && hidden === 0) {
    const answered = rows.length === 1 ? 'The 1 request has an answer.' : `All ${rows.length} requests have an answer.`;
    return `${answered} Nothing is booked.`;
  }
  const parts: string[] = [];
  if (waiting.length > 0) {
    parts.push(waiting.length === 1 ? '1 direct request is waiting.' : `${waiting.length} direct requests are waiting.`);
    parts.push(open.length === 1 ? '1 still names a free night.' : `${open.length} still name a free night.`);
    if (stale.length > 0) {
      parts.push(stale.length === 1 ? '1 has waited more than 2 days.' : `${stale.length} have waited more than 2 days.`);
    }
  } else if (hidden > 0) {
    parts.push(`Every request shown has an answer.`);
  }
  // The hidden count is never folded into the waiting count: those rows were not read, so their state
  // is unknown. Saying only how many there are is the honest statement.
  if (hidden > 0) {
    parts.push(
      hidden === 1
        ? '1 more is not shown on this list. Open the older requests to answer it.'
        : `${hidden} more are not shown on this list. Open the older requests to answer them.`,
    );
  }
  parts.push('Nothing is booked.');
  return parts.join(' ');
}
