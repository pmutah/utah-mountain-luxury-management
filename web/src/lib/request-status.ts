import { isDeclineReason, type DeclineReason } from './booking-decline';
import { isRealDay } from './market/dates';
import type { HouseId } from './market/types';

/**
 * A guest who sends a direct request can see where it stands. Before this the guest got a receipt and
 * then nothing until a person wrote back: there was no page, no token, and no way to tell "waiting on
 * a person" from "declined two days ago".
 *
 * Everything here is written for a guest who may not know the vocabulary. It says request, never
 * booking, until the request actually became one, and it never carries a price, a door code, or the
 * host's internal wording.
 */
/**
 * `cancelled` is its own state. A stay that was accepted and later cancelled is not "expired": the
 * guest was answered, and telling them nobody replied in time would be false.
 */
export type RequestStatus = 'waiting' | 'accepted' | 'declined' | 'expired' | 'cancelled';

export type RequestView = {
  /** Always "request" until accepted. A guest should never read that a stay is booked before it is. */
  status: RequestStatus;
  houses: HouseId[];
  checkIn: string;
  checkOut: string;
  nights: number;
  guests?: number;
  children?: number;
  /** When the dates stop being held, when a hold is still live. */
  heldUntil?: string;
  /** Why the host could not take the stay, in guest words. Only on a decline. */
  reason?: string;
  /** When the host answered. Only after a decision. */
  answeredAt?: string;
};

/** Guest wording for a decline reason. It never blames the guest and never quotes a rate. */
const GUEST_REASON: Record<DeclineReason, string> = {
  'dates-taken': 'Those nights are already spoken for at that house.',
  'too-many-guests': 'That house cannot hold a party this size.',
  'minimum-stay': 'That stay is shorter than the house asks for at that time of year.',
  maintenance: 'The house is closed for work on those dates.',
  'owner-stay': 'The owners are using the house on those dates.',
  other: 'Those dates are not open this time.',
};

const HOUSE_LABEL: Record<HouseId, string> = {
  river: 'The River House',
  ranch: 'The Ranch House',
  lindon: 'The Lindon House',
};

function houseFrom(value: unknown): HouseId | null {
  return value === 'ranch' || value === 'lindon' || value === 'river' ? value : null;
}

/** Whole nights between two real days. Zero when the range is unusable. */
function nightsBetween(checkIn: string, checkOut: string): number {
  if (!isRealDay(checkIn) || !isRealDay(checkOut) || checkOut <= checkIn) return 0;
  const [y1, m1, d1] = checkIn.split('-').map(Number);
  const [y2, m2, d2] = checkOut.split('-').map(Number);
  const start = Date.UTC(y1!, m1! - 1, d1);
  const end = Date.UTC(y2!, m2! - 1, d2);
  return Math.round((end - start) / 86_400_000);
}

export type RequestStatusInput = {
  propertyId?: unknown;
  alsoPropertyId?: unknown;
  checkIn?: unknown;
  checkOut?: unknown;
  guests?: unknown;
  children?: unknown;
};

export type RequestStatusDecision = {
  /** The request id, so an accepted stay can be matched exactly rather than by date alone. */
  requestId: string;
  /** Saved stays. The accept writes `Direct request <id>.` into the note. */
  stays: readonly {
    note?: string | null;
    propertyId?: string;
    checkIn?: string;
    checkOut?: string;
    status?: string;
  }[];
  /** The saved decline for this request, when there is one. */
  decline?: { reason?: unknown; at?: unknown } | null;
  /**
   * The hold for this request, when one was made. A hold that has run out, or that was released, has
   * ended: the dates are free again and the guest should be told so rather than shown a live clock.
   */
  hold?: { expiresAt?: unknown; released?: unknown } | null;
  /**
   * Today, so a hold that has run out is not shown as live. `now` is the real instant when the caller
   * has one; without it a hold that expired earlier today would still read as running, because two
   * ISO strings on the same date compare equal by day.
   */
  asOf: string;
  now?: string;
};

/**
 * What the guest is shown. A request the host accepted reads as booked; one with a decline record
 * reads declined; one whose hold has run out with no decision reads expired. Anything else is still
 * waiting, which is the honest state: nobody has answered yet.
 */
export function requestView(
  request: RequestStatusInput,
  decision: RequestStatusDecision,
): RequestView | null {
  const checkIn = typeof request.checkIn === 'string' ? request.checkIn : '';
  const checkOut = typeof request.checkOut === 'string' ? request.checkOut : '';
  const nights = nightsBetween(checkIn, checkOut);
  if (nights === 0) return null;

  const first = houseFrom(request.propertyId);
  if (!first) return null;
  const second = houseFrom(request.alsoPropertyId);
  const houses: HouseId[] = second && second !== first ? [first, second] : [first];

  const guests =
    typeof request.guests === 'number' && Number.isInteger(request.guests) && request.guests >= 1
      ? request.guests
      : undefined;
  const children =
    typeof request.children === 'number' && Number.isInteger(request.children) && request.children >= 0
      ? request.children
      : undefined;

  const base = {
    houses,
    checkIn,
    checkOut,
    nights,
    ...(guests !== undefined ? { guests } : {}),
    ...(children !== undefined ? { children } : {}),
  };

  // An accepted stay is the only thing that makes this a booking. The note carries the request id,
  // so the match is exact: a different party on the same nights must not read as accepted.
  const marker = `Direct request ${decision.requestId}.`;
  const mine = decision.stays.filter((stay) => typeof stay.note === 'string' && stay.note.includes(marker));
  const booked = mine.find((stay) => stay.status !== 'cancelled');
  if (booked) {
    return { ...base, status: 'accepted' };
  }
  // A stay that was accepted and then called off is not an unanswered request. The guest was
  // answered, so the page has to say the stay was cancelled rather than "nobody replied in time".
  if (mine.length > 0) {
    return { ...base, status: 'cancelled' };
  }

  if (decision.decline) {
    const reason = isDeclineReason(decision.decline.reason) ? GUEST_REASON[decision.decline.reason] : GUEST_REASON.other;
    const at = typeof decision.decline.at === 'string' && !Number.isNaN(Date.parse(decision.decline.at)) ? decision.decline.at : undefined;
    return { ...base, status: 'declined', reason, ...(at ? { answeredAt: at } : {}) };
  }

  const hold = decision.hold ?? null;
  const expiresAt = typeof hold?.expiresAt === 'string' ? hold.expiresAt : '';
  const parsed = expiresAt ? Date.parse(expiresAt) : Number.NaN;
  // The exact instant matters: a hold that ran out an hour ago is over, even though it is still
  // "today". A released hold has done its job. Either way the dates are free again.
  const nowMs = decision.now ? Date.parse(decision.now) : Number.NaN;
  const notYetOver = !Number.isNaN(parsed) && (Number.isNaN(nowMs) ? expiresAt.slice(0, 10) >= decision.asOf : parsed > nowMs);
  const live = hold !== null && hold.released !== true && notYetOver;
  if (hold !== null && !live) {
    return { ...base, status: 'expired' };
  }
  return { ...base, status: 'waiting', ...(live ? { heldUntil: expiresAt } : {}) };
}

/** The house names for a guest line, in a stable order. */
export function requestHouseLine(houses: readonly HouseId[]): string {
  const names = houses.map((house) => HOUSE_LABEL[house]);
  if (names.length === 0) return '';
  if (names.length === 1) return names[0]!;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * One sentence for the guest page. It states the state plainly and never promises the dates while
 * nobody has answered.
 */
export function requestStatusLine(view: RequestView): string {
  const nights = view.nights === 1 ? '1 night' : `${view.nights} nights`;
  switch (view.status) {
    case 'accepted':
      return `Your stay is confirmed for ${nights}.`;
    case 'declined':
      return `We could not take these dates. ${view.reason ?? ''}`.trim();
    case 'expired':
      /*
       * The hold has let go, but the request is still on the desk and can still be accepted. The old
       * wording said "nobody answered in time", which was false: the host had not answered *yet*, and
       * accepting it a minute later was allowed. Telling a guest to send it again also invited a
       * duplicate request for the same nights.
       */
      return 'The short hold on these dates has ended. Your request is still with us and can still be accepted, so you do not need to send it again. The dates are no longer held for you while we reply.';
    case 'cancelled':
      return `This stay was cancelled, so ${nights} are free again. Reply to our email if you would like to move the dates.`;
    case 'waiting':
    default:
      return view.heldUntil
        ? `Your request is with us. These dates are held while a person reads it, and the hold lets go on its own.`
        : 'Your request is with us. A person reads every request and writes back, usually the same day.';
  }
}

/**
 * What a guest is told about the hold. A live hold names the time it lets go. An expired one says so
 * rather than showing a clock that already passed.
 */
export function holdLine(view: RequestView): string | null {
  if (view.status !== 'waiting' || !view.heldUntil) return null;
  const at = Date.parse(view.heldUntil);
  if (Number.isNaN(at)) return null;
  const time = new Date(at).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Denver',
  });
  const line = `Held until ${time} Mountain time. Nothing is charged, and no card was asked for.`;
  return /\$\d/.test(line) ? 'Held for a short time. Nothing is charged.' : line;
}
