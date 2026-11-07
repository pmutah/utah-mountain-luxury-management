import { addDays, weekdayIndex } from './market/dates';
import type { YearPace } from './market/fill';
import { nightAsk } from './market/rates';
import type { QuotedSheetNight } from './market/rate-sheet';
import type { HouseId } from './market/types';
import { eventNameOn } from './market/events';
import { directNight, guestPromoMark } from './quote';
import { shortestStay } from './shortest-stay';

export type StayPick = {
  checkIn: string;
  checkOut: string;
};

export type StayDay = {
  iso: string;
  inMonth: boolean;
  guest: number;
  direct: number;
  minNights: number;
  /** Shortest stay that can start this night. Empty when this night cannot start one. */
  startNights: number | null;
  booked: boolean;
  /** A calendar block. This is not a stay. */
  held: boolean;
  closed: boolean;
  past: boolean;
  isCheckIn: boolean;
  isCheckOut: boolean;
  inStay: boolean;
  /** This open night is discounted. A booked or closed night is not. */
  promo: boolean;
  /** True when the host approved this night's price instead of the published card. */
  approved: boolean;
};

export function shiftMonth(yearMonth: string, delta: number): string {
  const [year, month] = yearMonth.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}

export function monthLabel(yearMonth: string): string {
  return new Date(`${yearMonth}-01T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Six weeks, Sunday through Saturday, with a guest price on every night. */
export function monthDays(
  yearMonth: string,
  house: HouseId,
  taken: readonly string[],
  stay: StayPick,
  today: string,
  pace: YearPace = 'unknown',
  blocked: readonly string[] = [],
  sheet: readonly QuotedSheetNight[] = [],
): StayDay[] {
  const first = `${yearMonth}-01`;
  const gridStart = addDays(first, -weekdayIndex(first));
  const booked = new Set(taken);
  const blocks = new Set(blocked);
  const days: StayDay[] = [];
  for (let i = 0; i < 42; i += 1) {
    const iso = addDays(gridStart, i);
    const ask = nightAsk(house, iso);
    const priced = directNight(house, iso, taken, today, pace, sheet);
    const held = blocks.has(iso);
    const stayNight = booked.has(iso) && !held;
    const canStart = iso >= today && !ask.closed && !booked.has(iso) && !blocks.has(iso);
    const start = canStart ? shortestStay(house, iso, taken, today, pace, undefined, [...blocks]) : null;
    days.push({
      iso,
      inMonth: iso.slice(0, 7) === yearMonth,
      guest: ask.guest,
      direct: priced.direct,
      minNights: ask.minNights,
      startNights: start?.nights ?? null,
      booked: stayNight,
      held,
      closed: ask.closed,
      past: iso < today,
      promo: priced.promotionPercent === 20 && !stayNight && !held && !ask.closed && iso >= today,
      approved: priced.approved === true,
      isCheckIn: iso === stay.checkIn,
      isCheckOut: iso === stay.checkOut,
      inStay: Boolean(stay.checkIn && stay.checkOut && iso >= stay.checkIn && iso < stay.checkOut),
    });
  }
  return days;
}

/** The line under the month. A stay that cannot be quoted is not called the stay. */
export function stayMonthNote(checkOut: boolean, quoted: boolean, prices = true): string {
  if (!prices && quoted && checkOut) {
    return 'Gold nights are the stay. The nightly price stays off this month. Nothing is sent.';
  }
  if (!prices) return 'This stay is not quoted. The month leaves the nightly price off. Nothing is sent.';
  if (!checkOut) return 'Choose the check-out morning. Prices are the direct nightly rate.';
  if (!quoted) {
    const line = 'These dates are on the page. This stay is not quoted. Nothing is sent. Prices on other nights are the direct nightly rate.';
    if (line.includes('$') || /\bis open\b/.test(line)) return 'This stay is not quoted. Nothing is sent.';
    return line;
  }
  return 'Gold nights are the stay. Prices are the direct nightly rate.';
}

/** A night on the quote month. A party that cannot stay leaves the price off. */
export function monthNightLabel(price: string, startNights: number | null, showPrice: boolean, promo = false): string {
  const length = startNights != null && startNights > 1 ? `${startNights} nt` : startNights == null ? 'too short' : '';
  if (!showPrice) return length;
  const off = promo ? guestPromoMark() : '';
  return [price, off, length].filter((part) => part.length > 0).join(' · ');
}

export type RateCardDay = {
  iso: string;
  inMonth: boolean;
  past: boolean;
  notYet: boolean;
  startNights: number | null;
  event: boolean;
  booked: boolean;
  held: boolean;
  /** A fill night. The cell names the discount and leaves the nightly price off. */
  promo: boolean;
  /** Direct price for the night, after any promotion or approved rate. */
  direct: number;
  /** True when the host approved this night's price instead of the published card. */
  approved: boolean;
};

/** A month from the rate card. Booked nights are marked only after the calendar is read. */
export function rateCardDays(
  yearMonth: string,
  house: HouseId,
  today: string,
  taken: readonly string[] | null = null,
  closed: readonly string[] | null = null,
  pace: YearPace = 'unknown',
  /** Host-approved guest rates. A night with none keeps the published card. */
  sheet: readonly QuotedSheetNight[] = [],
): RateCardDay[] {
  const first = `${yearMonth}-01`;
  const gridStart = addDays(first, -weekdayIndex(first));
  const bookedNights = new Set(taken ?? []);
  const blocks = new Set(closed ?? []);
  const knownPace: YearPace = taken === null ? 'unknown' : pace;
  const days: RateCardDay[] = [];
  for (let i = 0; i < 42; i += 1) {
    const iso = addDays(gridStart, i);
    const ask = nightAsk(house, iso);
    const past = iso < today;
    const notYet = ask.closed;
    const held = taken !== null && blocks.has(iso);
    const booked = taken !== null && bookedNights.has(iso) && !held;
    const start = !past && !notYet && !booked && !held
      ? shortestStay(house, iso, taken ?? [], today, 'unknown', undefined, [...blocks])
      : null;
    const priced = directNight(house, iso, taken ?? [], today, knownPace, sheet);
    days.push({
      iso,
      inMonth: iso.slice(0, 7) === yearMonth,
      past,
      notYet,
      startNights: start?.nights ?? null,
      event: Boolean(eventNameOn(iso)),
      booked,
      held,
      promo: start !== null && priced.promotionPercent === 20 && !past && !notYet && !booked && !held,
      direct: priced.direct,
      approved: priced.approved === true,
    });
  }
  return days;
}

export function rateCardCell(day: RateCardDay): string {
  if (!day.inMonth || day.past) return '';
  if (day.booked) return 'Booked';
  if (day.held) return 'Closed';
  if (day.notYet) return 'Not yet';
  const mark = day.promo ? guestPromoMark() : '';
  if (day.startNights == null) return 'Too short';
  if (day.startNights > 1) return mark ? `${day.startNights} nights · ${mark}` : `${day.startNights} nights`;
  return mark;
}

export function rateCardNote(known = false): string {
  if (known) return 'Booked nights and calendar blocks are marked. This month has no price. Nothing is charged yet.';
  return 'This month follows the rate card. It does not say which nights are booked or open. Nothing is charged yet.';
}

/** The arrival night's minimum, when that house asks for more than one night. */
export function arrivalMinimum(house: HouseId, checkIn: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn)) return null;
  const ask = nightAsk(house, checkIn);
  if (ask.closed || ask.minNights <= 1) return null;
  return ask.minNights;
}

/**
 * First click chooses check-in. The next click chooses the morning of check-out.
 * A booked or closed night can be a checkout morning, and it cannot be a night in the stay.
 */
export function pickStay(
  stay: StayPick,
  iso: string,
  taken: readonly string[],
  house: HouseId,
  today: string,
  closed: readonly string[] = [],
): StayPick {
  const ask = nightAsk(house, iso);
  const blockedStart =
    iso < today ||
    ask.closed ||
    taken.includes(iso) ||
    closed.includes(iso) ||
    shortestStay(house, iso, taken, today, 'unknown', undefined, closed) === null;
  const choosingCheckout = Boolean(stay.checkIn) && !stay.checkOut;

  if (!choosingCheckout) {
    if (blockedStart) return stay;
    return { checkIn: iso, checkOut: '' };
  }
  if (iso <= stay.checkIn) {
    if (blockedStart) return { checkIn: stay.checkIn, checkOut: '' };
    return { checkIn: iso, checkOut: '' };
  }

  let cursor = stay.checkIn;
  while (cursor < iso) {
    const night = nightAsk(house, cursor);
    if (taken.includes(cursor) || closed.includes(cursor) || night.closed) return stay;
    cursor = addDays(cursor, 1);
  }
  return { checkIn: stay.checkIn, checkOut: iso };
}

/** Why this night cannot start a stay. Empty when it can. */
export function checkInHold(
  iso: string,
  house: HouseId,
  taken: readonly string[],
  closed: readonly string[] = [],
  asOf: string,
): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return null;
  if (iso < asOf) return 'That check-in has already passed.';
  const ask = nightAsk(house, iso);
  if (ask.closed) return 'The River House takes its first stays on November 1, 2026.';
  if (closed.includes(iso)) return 'Those nights are closed on the calendar.';
  if (taken.includes(iso)) return 'Those nights are already booked.';
  if (shortestStay(house, iso, taken, asOf, 'unknown', undefined, closed) === null) return 'That night cannot start a stay.';
  return null;
}

/** A checkout morning on a booked or closed night is allowed. A later morning would include that night. */
export function checkoutCrosses(
  checkIn: string,
  checkOut: string,
  house: HouseId,
  taken: readonly string[],
  closed: readonly string[] = [],
): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut) || checkOut <= checkIn) return false;
  let cursor = checkIn;
  while (cursor < checkOut) {
    const night = nightAsk(house, cursor);
    if (taken.includes(cursor) || closed.includes(cursor) || night.closed) return true;
    cursor = addDays(cursor, 1);
  }
  return false;
}

function morningLabel(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** The last checkout morning before a booked, closed, or not-yet night. Empty when the next 28 nights are clear. */
export function checkoutLimit(
  checkIn: string,
  house: HouseId,
  taken: readonly string[],
  closed: readonly string[] = [],
): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn)) return null;
  let cursor = checkIn;
  for (let i = 0; i < 28; i += 1) {
    const night = nightAsk(house, cursor);
    if (taken.includes(cursor) || closed.includes(cursor) || night.closed) {
      return cursor === checkIn ? null : cursor;
    }
    cursor = addDays(cursor, 1);
  }
  return null;
}

/** A typed checkout that would include a booked or closed night stops on that morning. */
export function heldCheckout(
  checkIn: string,
  checkOut: string,
  house: HouseId,
  taken: readonly string[],
  closed: readonly string[] = [],
): string {
  if (!checkoutCrosses(checkIn, checkOut, house, taken, closed)) return checkOut;
  const limit = checkoutLimit(checkIn, house, taken, closed);
  if (!limit || limit <= checkIn) return checkOut;
  return limit;
}

/** The last checkout morning before a booked, closed, or not-yet night. Empty when the next 28 nights are clear. */
export function checkoutStopLine(
  checkIn: string,
  house: HouseId,
  taken: readonly string[],
  closed: readonly string[] = [],
): string | null {
  const limit = checkoutLimit(checkIn, house, taken, closed);
  if (!limit) return null;
  const when = morningLabel(limit);
  const night = nightAsk(house, limit);
  const onCalendar = taken.includes(limit) || closed.includes(limit);
  const closedNight = night.closed || closed.includes(limit);
  const why = night.closed && !onCalendar
    ? 'A later morning is before this house takes its first stays.'
    : closedNight
      ? 'A later morning would include a closed night.'
      : 'A later morning would include a booked night.';
  const line = `Checkout can be ${when}. ${why}`;
  if (line.includes('$') || /\bopen\b/i.test(line) || /door\s*code|wi-?fi|password/i.test(line)) return null;
  return line;
}
