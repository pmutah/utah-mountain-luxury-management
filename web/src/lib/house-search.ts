import { compoundOffer, compoundSplitLine } from './compound';
import { housePageHref, houseQuoteHref, houseQuoteLabel, quoteHouseForParty } from './house-page';
import { addDays } from './market/dates';
import { partyFits, SLEEPS } from './house-stay';
import { stayEventLine } from './market/events';
import type { YearPace } from './market/fill';
import type { HouseId } from './market/types';
import { openArrivals } from './open-arrivals';
import { publishedStayRule, quoteStay } from './quote';
import { publishedShortestLine, shortestStay } from './shortest-stay';
import { stayRhythm } from './stay-rhythm';

const HOUSES: HouseId[] = ['river', 'ranch', 'lindon'];
const NAME: Record<HouseId, string> = { river: 'River', ranch: 'Ranch', lindon: 'Lindon' };
const FULL: Record<HouseId, string> = {
  river: 'The River House',
  ranch: 'The Ranch House',
  lindon: 'The Lindon House',
};

export type HouseSearchRow = {
  house: HouseId;
  ok: boolean;
  line: string;
  href: string;
};

export type HouseSearch = {
  rows: HouseSearchRow[];
  event: string | null;
  together: { ok: boolean; line: string; href: string } | null;
};

function quoteHref(house: HouseId, checkIn: string, checkOut: string, guests: number, children?: number): string {
  const params = new URLSearchParams({
    house,
    in: checkIn,
    out: checkOut,
    guests: String(guests),
  });
  if (children && children > 0) params.set('children', String(children));
  return `/book?${params.toString()}`;
}

function withoutPrice(text: string): string {
  return text.includes('$') ? 'This stay is not quoted.' : text;
}

function houseLine(name: string, ok: boolean, reason: string | null): string {
  if (ok) return `${name} will quote these dates.`;
  const text = withoutPrice(reason ?? 'This stay is not quoted.');
  if (text.startsWith('The ') || text.startsWith(`${name}:`) || text.startsWith(`${name} `)) return text;
  return `${name}: ${text}`;
}

/** The house button on the quote. No price, and it does not say the house is open. */
export function housePickLine(
  house: HouseId,
  checkIn: string,
  checkOut: string,
  taken: readonly string[],
  asOf: string,
  pace: YearPace,
  closed: readonly string[] = [],
  guests?: number,
  children?: number,
): string {
  const quote = quoteStay(house, checkIn, checkOut, taken, {
    asOf,
    pace,
    closed,
    ...(guests !== undefined ? { guests, ...(children !== undefined ? { children } : {}) } : {}),
  });
  if (quote.ok) return 'These dates can be quoted.';
  const reason = quote.reason ?? 'This stay is not quoted.';
  if (reason.includes('$') || /door\s*code|wi-?fi|password/i.test(reason)) return 'This stay is not quoted.';
  return reason;
}

/** When these dates are booked or closed, the next stay this house can quote. Choosing the house keeps the dates. */
export function houseNextStayLine(
  house: HouseId,
  checkIn: string,
  checkOut: string,
  taken: readonly string[],
  asOf: string,
  pace: YearPace,
  closed: readonly string[] = [],
  guests?: number,
  children?: number,
): string {
  const status = housePickLine(house, checkIn, checkOut, taken, asOf, pace, closed, guests, children);
  if (!/already booked|closed on the calendar|first stays|already passed/i.test(status)) return '';
  const next = openArrivals(house, taken, asOf, pace, 1, closed, guests, children, checkIn)[0];
  if (!next || (next.checkIn === checkIn && next.checkOut === checkOut)) return '';
  const line = `Next stay this page can quote: ${next.label}. Choosing this house keeps these dates. Nothing is held.`;
  if (line.includes('$') || /\bis open\b/.test(line) || /door\s*code|wi-?fi|password/i.test(line)) return '';
  return line;
}

/** The house cards on the list. No price, and they do not say a house is open. */
export function houseCardLines(
  checkIn: string,
  checkOut: string,
  taken: Partial<Record<HouseId, readonly string[]>>,
  asOf: string,
  closed: Partial<Record<HouseId, readonly string[]>> = {},
  guests?: number,
  children?: number,
): { house: HouseId; line: string; next: string }[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut) || checkOut <= checkIn) return [];
  const rows = HOUSES.map((house) => ({
    house,
    line: housePickLine(house, checkIn, checkOut, taken[house] ?? [], asOf, 'unknown', closed[house] ?? [], guests, children),
    next: houseNextStayLine(house, checkIn, checkOut, taken[house] ?? [], asOf, 'unknown', closed[house] ?? [], guests, children),
  }));
  if (rows.some((row) => row.line.includes('$') || /\bis open\b/.test(row.line) || /door\s*code|wi-?fi|password/i.test(row.line))) {
    return [];
  }
  return rows.map((row) =>
    row.next.includes('$') || /\bis open\b/.test(row.next) || /door\s*code|wi-?fi|password/i.test(row.next)
      ? { ...row, next: '' }
      : row,
  );
}

/** Which houses will quote these dates. The lines have no price and do not send a request. */
export function searchHouses(
  checkIn: string,
  checkOut: string,
  guests: number,
  children: number | undefined,
  taken: Partial<Record<HouseId, readonly string[]>>,
  asOf: string,
  paceFor: (house: HouseId) => YearPace,
  closed?: Partial<Record<HouseId, readonly string[]>>,
): HouseSearch {
  const rows = HOUSES.map((house) => {
    const quote = quoteStay(house, checkIn, checkOut, taken[house] ?? [], {
      asOf,
      pace: paceFor(house),
      closed: closed?.[house] ?? [],
      guests,
      ...(children !== undefined ? { children } : {}),
    });
    return {
      house,
      ok: quote.ok,
      line: houseLine(NAME[house], quote.ok, quote.reason),
      href: quoteHref(house, checkIn, checkOut, guests, children),
    };
  });
  const offer = compoundOffer(checkIn, checkOut, guests, children, taken, asOf, paceFor, closed);
  const href = quoteHref('river', checkIn, checkOut, guests, children);
  const together = !offer.show
    ? null
    : {
        ok: offer.ok,
        line: withoutPrice(offer.ok ? offer.line : offer.reason),
        href,
      };
  return { rows, event: stayEventLine(checkIn, checkOut), together };
}

export type StayRuleLine = { house: HouseId; name: string; line: string };

/** Other houses that fail a published night rule. The house on the quote is left off. No price. */
export function otherStayRules(
  house: HouseId,
  checkIn: string,
  checkOut: string,
  guests: number | undefined,
  children: number | undefined,
  asOf: string,
): StayRuleLine[] {
  const lines = stayRuleLines(checkIn, checkOut, guests, children, asOf).filter((row) => row.house !== house);
  if (lines.some((row) => row.line.includes('$') || /\bis open\b/.test(row.line) || /door\s*code|wi-?fi|password/i.test(row.line))) {
    return [];
  }
  return lines;
}

/** Published night rules for these dates. A house that passes is left off. No price. */
export function stayRuleLines(
  checkIn: string,
  checkOut: string,
  guests: number | undefined,
  children: number | undefined,
  asOf: string,
): StayRuleLine[] {
  return HOUSES.flatMap((house) => {
    const rule = publishedStayRule(house, checkIn, checkOut, guests, children, asOf);
    if (!rule) return [];
    return [{ house, name: FULL[house], line: `${FULL[house]}: ${rule}` }];
  });
}

export type ShortestFix = { house: HouseId; line: string; href: string; checkOut: string };

/** When these dates fail, the shortest stay that check-in can quote. The link stays on the house page. */
export function shortestFixLines(
  checkIn: string,
  checkOut: string,
  guests: number | undefined,
  asOf: string,
  children?: number,
): ShortestFix[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut) || checkOut <= checkIn) return [];
  const guestText = guests !== undefined ? String(guests) : '';
  const childText = children && children > 0 ? String(children) : '';
  const rows: ShortestFix[] = [];
  for (const house of HOUSES) {
    const line = publishedShortestLine(house, checkIn, checkOut, asOf, guests, [], [], children);
    const next = shortestStay(house, checkIn, [], asOf, 'unknown', guests, [], children);
    if (!line || !next || next.checkOut === checkOut) continue;
    if (/door\s*code|wi-?fi|password/i.test(line)) continue;
    rows.push({
      house,
      line: `${NAME[house]}: ${line}`,
      href: housePageHref(house, checkIn, next.checkOut, guestText, childText),
      checkOut: next.checkOut,
    });
  }
  if (rows.some((row) => row.line.includes('$'))) return [];
  return rows;
}

const HELD = new Set(['Those nights are already booked.', 'Those nights are closed on the calendar.']);

/** Booked or closed nights before a party is entered. No price, and a free span stays off this list. */
export function heldSearchLines(
  checkIn: string,
  checkOut: string,
  taken: Partial<Record<HouseId, readonly string[]>>,
  asOf: string,
  closed?: Partial<Record<HouseId, readonly string[]>>,
): { house: HouseId; line: string }[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut) || checkOut <= checkIn) return [];
  const rows = HOUSES.flatMap((house) => {
    const quote = quoteStay(house, checkIn, checkOut, taken[house] ?? [], {
      asOf,
      pace: 'unknown',
      closed: closed?.[house] ?? [],
    });
    if (quote.ok || !quote.reason || quote.reason.includes('$')) return [];
    if (quote.reason === 'The River House takes its first stays on November 1, 2026.') {
      return [{ house, line: quote.reason }];
    }
    if (!HELD.has(quote.reason)) return [];
    return [{ house, line: `${NAME[house]}: ${quote.reason}` }];
  });
  if (rows.some((row) => /\bis open\b/.test(row.line))) return [];
  return rows;
}

function heldReason(
  house: HouseId,
  checkIn: string,
  checkOut: string,
  guests: number | undefined,
  children: number | undefined,
  asOf: string,
  taken: Partial<Record<HouseId, readonly string[]>>,
  closed: Partial<Record<HouseId, readonly string[]>>,
): string | null {
  const quote = quoteStay(house, checkIn, checkOut, taken[house] ?? [], {
    asOf,
    pace: 'unknown',
    closed: closed[house] ?? [],
    ...(guests !== undefined ? { guests, ...(children !== undefined ? { children } : {}) } : {}),
  });
  if (!quote.ok && quote.reason && HELD.has(quote.reason) && !quote.reason.includes('$')) return quote.reason;
  return null;
}

const RIVER_OPENS = 'The River House takes its first stays on November 1, 2026.';

function openingReason(
  house: HouseId,
  checkIn: string,
  checkOut: string,
  guests: number | undefined,
  children: number | undefined,
  asOf: string,
): string | null {
  const quote = quoteStay(house, checkIn, checkOut, [], {
    asOf,
    pace: 'unknown',
    ...(guests !== undefined ? { guests, ...(children !== undefined ? { children } : {}) } : {}),
  });
  if (!quote.ok && quote.reason === RIVER_OPENS) return RIVER_OPENS;
  return null;
}

/** Gold on the house month means this page can quote the stay. A booked, closed, or not-yet stay stays unpainted. */
export function quotedStayPaint(label: string, booked: boolean): boolean {
  if (booked) return false;
  if (/already booked|closed on the calendar|first stays|reading the calendar|needs an adult|children are part|sleeps \d|at least \d+ nights/i.test(label)) return false;
  if (label.includes('$') || /\bis open\b/.test(label)) return false;
  return true;
}

/** Pace for the house month. A party that does not fit the house, and an unread calendar, stay unknown. */
export function houseMonthPace(
  house: HouseId,
  guests: string,
  children: string,
  calendar: 'loading' | 'ready' | 'unread',
  pace: YearPace | null,
): YearPace {
  const count = /^\d+$/.test(guests) ? Number(guests) : null;
  const kids = /^\d+$/.test(children) && Number(children) > 0 ? Number(children) : undefined;
  const fits = count === null || partyFits(house, count, kids).ok;
  if (!fits || calendar !== 'ready') return 'unknown';
  if (pace === 'short' || pace === 'met') return pace;
  return 'unknown';
}

/** The button while the calendar is still loading. It does not call the stay a quote. */
export function houseQuotePending(): { label: string; caption: string } {
  const label = 'Reading the calendar.';
  const caption = 'This stay is not quoted yet. Nothing is sent.';
  if (label.includes('$') || caption.includes('$') || /\bis open\b/.test(`${label} ${caption}`)) {
    return { label: 'Reading the calendar.', caption: 'Nothing is sent.' };
  }
  return { label, caption };
}

/** The line under the house quote button. A refused stay is not called a quote. */
export function houseQuoteCaption(label: string, booked: boolean, shortened = false): string {
  if (shortened && label === 'See both houses') {
    const line = 'This link quotes the longer stay for both houses. The dates on this page stay. Nothing is held.';
    if (line.includes('$') || /\bis open\b/.test(line)) return 'Nothing is held.';
    return line;
  }
  if (!quotedStayPaint(label, booked)) {
    const line = 'This stay is not quoted. Nothing is sent.';
    if (line.includes('$') || /\bis open\b/.test(line)) return 'Nothing is sent.';
    return line;
  }
  return 'The booking page quotes the stay. It does not charge a card or hold the dates.';
}

function stayNights(checkIn: string, checkOut: string): number {
  let nights = 0;
  let cursor = checkIn;
  while (cursor < checkOut && nights < 40) {
    cursor = addDays(cursor, 1);
    nights += 1;
  }
  return nights;
}

/** A party in both houses follows that quote once the calendar is read. A longer stay is used only when both houses accept it. */
function bothCalendarQuote(
  checkIn: string,
  checkOut: string,
  guests: number,
  children: number | undefined,
  taken: Partial<Record<HouseId, readonly string[]>>,
  closed: Partial<Record<HouseId, readonly string[]>>,
  asOf: string,
  guestText: string,
  childText: string,
): { href: string; label: string; shortened: boolean; booked: boolean } {
  const paceFor = () => 'unknown' as const;
  const same = houseQuoteHref('river', checkIn, checkOut, guestText, childText);
  const asked = compoundOffer(checkIn, checkOut, guests, children, taken, asOf, paceFor, closed);
  if (asked.show && asked.ok) {
    return { href: same, label: 'See both houses', shortened: false, booked: false };
  }
  const reason = asked.show && asked.reason && !asked.reason.includes('$') ? asked.reason : 'This stay is not quoted.';
  if (/at least \d+ nights/.test(reason)) {
    let cursor = checkOut;
    while (stayNights(checkIn, cursor) < 28) {
      cursor = addDays(cursor, 1);
      const offer = compoundOffer(checkIn, cursor, guests, children, taken, asOf, paceFor, closed);
      if (offer.show && offer.ok) {
        return {
          href: houseQuoteHref('river', checkIn, cursor, guestText, childText),
          label: 'See both houses',
          shortened: true,
          booked: false,
        };
      }
    }
  }
  const booked = /already booked|closed on the calendar|first stays|already passed/i.test(reason);
  return { href: same, label: reason, shortened: false, booked };
}

/** The quote button. A failed stay uses the shortest checkout. A booked night is named instead. Nothing is held. */
export function quotedStayHref(
  house: HouseId,
  checkIn: string,
  checkOut: string,
  guests = '',
  children = '',
  asOf = '',
  taken: Partial<Record<HouseId, readonly string[]>> | null = null,
  closed: Partial<Record<HouseId, readonly string[]>> | null = null,
): { href: string; label: string; shortened: boolean; booked: boolean } {
  const guestCount = /^\d+$/.test(guests) ? Number(guests) : undefined;
  const childCount = /^\d+$/.test(children) && Number(children) > 0 ? Number(children) : undefined;
  const target = quoteHouseForParty(house, guests, children);
  const adults = guestCount === undefined ? 0 : guestCount - (childCount ?? 0);
  const both =
    guestCount !== undefined && adults >= 2 && guestCount > SLEEPS.river && guestCount <= SLEEPS.river + SLEEPS.ranch;
  const fitsTarget = guestCount === undefined || guestCount <= SLEEPS[target];
  const label = houseQuoteLabel(house, guests, children);
  if (!fitsTarget && !both) {
    const party = guestCount !== undefined ? partyFits(house, guestCount, childCount) : null;
    const refused = party && !party.ok && party.reason && !party.reason.includes('$') ? party.reason : label;
    return { href: houseQuoteHref(house, checkIn, checkOut, guests, children), label: refused, shortened: false, booked: false };
  }
  const notYet = openingReason(target, checkIn, checkOut, fitsTarget ? guestCount : undefined, fitsTarget ? childCount : undefined, asOf);
  if (notYet) {
    return { href: houseQuoteHref(house, checkIn, checkOut, guests, children), label: notYet, shortened: false, booked: false };
  }
  if (both && taken && guestCount !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
    return bothCalendarQuote(checkIn, checkOut, guestCount, childCount, taken, closed ?? {}, asOf, guests, children);
  }
  const guestsForHold = fitsTarget ? guestCount : undefined;
  const childrenForHold = fitsTarget ? childCount : undefined;
  if (taken) {
    const askedHeld = heldReason(target, checkIn, checkOut, guestsForHold, childrenForHold, asOf, taken, closed ?? {});
    if (askedHeld) {
      return {
        href: houseQuoteHref(house, checkIn, checkOut, guests, children),
        label: askedHeld,
        shortened: false,
        booked: true,
      };
    }
  }
  if (guestCount !== undefined && !both) {
    const party = partyFits(target, guestCount, childCount);
    if (!party.ok && party.reason && !party.reason.includes('$')) {
      return { href: houseQuoteHref(house, checkIn, checkOut, guests, children), label: party.reason, shortened: false, booked: false };
    }
  }
  const fix = shortestFixLines(checkIn, checkOut, guestsForHold, asOf, childrenForHold).find((row) => row.house === target);
  const outgoing = fix?.checkOut ?? checkOut;
  if (taken) {
    const offeredHeld = heldReason(target, checkIn, outgoing, guestsForHold, childrenForHold, asOf, taken, closed ?? {});
    if (offeredHeld) {
      return {
        href: houseQuoteHref(house, checkIn, outgoing, guests, children),
        label: offeredHeld,
        shortened: false,
        booked: true,
      };
    }
  }
  return {
    href: houseQuoteHref(house, checkIn, outgoing, guests, children),
    label: fix && label === 'See the dates' ? 'See the shortest stay' : label,
    shortened: Boolean(fix),
    booked: false,
  };
}

export type HouseRhythm = { house: HouseId; name: string; lines: string[] };

export type PartyFit = { house: HouseId; name: string; fits: boolean; line: string };

const TOGETHER = SLEEPS.river + SLEEPS.ranch;

/** Whether the party fits each house. No price, and it does not say a date is open. */
export function partyFitList(
  guests: number,
  children?: number,
): { rows: PartyFit[]; together: string | null } {
  if (!Number.isInteger(guests) || guests < 1) return { rows: [], together: null };
  const childProblem =
    children !== undefined && children !== 0 && (!Number.isInteger(children) || children < 0 || children > guests)
      ? 'Children are part of the overnight guests.'
      : children === guests
        ? 'A stay needs an adult.'
        : null;
  if (childProblem) {
    return {
      rows: HOUSES.map((house) => ({ house, name: FULL[house], fits: false, line: childProblem })),
      together: null,
    };
  }
  const rows = HOUSES.map((house) => {
    const fit = partyFits(house, guests, children);
    const sleeps = SLEEPS[house];
    return {
      house,
      name: FULL[house],
      fits: fit.ok,
      line: fit.ok
        ? `${FULL[house]} sleeps ${sleeps}. This party fits that house.`
        : `${FULL[house]} sleeps ${sleeps}. This party is larger than that house.`,
    };
  });
  const split = guests > SLEEPS.river && guests <= TOGETHER ? compoundSplitLine(guests, children) : '';
  const together =
    guests > SLEEPS.river && guests <= TOGETHER
      ? `This party is larger than any one house. Ranch and River together sleep ${TOGETHER}. ${split ? `${split} ` : ''}This line does not hold the dates.`
      : guests > TOGETHER
        ? `This party is larger than Ranch and River together. Together they sleep ${TOGETHER}.`
        : null;
  return { rows, together };
}

/** A numbered party for the desk. The together line is said once. No price. */
export function partyDeskAnswer(houses: readonly HouseId[], guests: string): string {
  if (!/^\d{1,2}$/.test(guests) || Number(guests) < 1) return '';
  const fit = partyFitList(Number(guests));
  const rows = fit.rows.filter((row) => houses.includes(row.house));
  if (rows.length === 0) return '';
  const text = [...rows.map((row) => row.line), fit.together ?? ''].filter((line) => line.length > 0).join(' ');
  if (text.includes('$') || /door\s*code|wi-?fi|password/i.test(text)) return '';
  return text;
}

/** Whether the party on a house link fits that house. No price, and it does not say the house is open. */
export function housePartyLine(house: HouseId, guests: string, children = ''): string {
  if (!/^\d{1,2}$/.test(guests) || Number(guests) < 1) return '';
  const childCount = /^\d{1,2}$/.test(children) && Number(children) > 0 ? Number(children) : undefined;
  const fit = partyFitList(Number(guests), childCount);
  const row = fit.rows.find((item) => item.house === house);
  if (!row) return '';
  const text = [row.line, fit.together ?? ''].filter((line) => line.length > 0).join(' ');
  if (text.includes('$') || /door\s*code|wi-?fi|password/i.test(text)) return '';
  return text;
}

const SECRET = /door\s*code|wi-?fi|password/i;

/** Arrival, quiet hours, checkout, and a named event on one house page. The door-code timing stays on the quote. */
export function housePageRhythm(house: HouseId, checkIn: string, checkOut: string): string[] {
  const lines = stayRhythm(house, checkIn, checkOut)
    .filter((line) => line.id !== 'code')
    .map((line) => line.text);
  if (lines.length === 0) return [];
  if (lines.some((line) => line.includes('$') || SECRET.test(line) || /\bis open\b/.test(line))) return [];
  return lines;
}

/** Arrival, quiet hours, and checkout for each house. No price, and it does not say a house is open. */
export function houseRhythms(checkIn: string, checkOut: string): HouseRhythm[] {
  return HOUSES.map((house) => ({
    house,
    name: FULL[house],
    lines: stayRhythm(house, checkIn, checkOut)
      .filter((line) => line.id === 'arrive' || line.id === 'quiet' || line.id === 'leave')
      .map((line) => line.text),
  })).filter((row) => row.lines.length > 0);
}
