import { PROPERTIES } from './api';
import { RIVER_FIRST_STAY } from './brand';
import { arriveReady } from './arrive-ready';
import { houseDay, type DayKind } from './house-day';
import {
  airportSentence,
  bedroomFact,
  checkoutStepHits,
  asksEarly,
  asksLate,
  flexStayLine,
  guideDirectionHits,
  guideNearbyHits,
  keepParkingLines,
  publicFlexLine,
  searchHouseManual,
  smokingRuleLine,
  stayGuideLookup,
  swimFacts,
  winterDriveLine,
} from './house-manual';
import { bothHouseQuote, bothHouseMonthNights, compoundOffer } from './compound';
import { bothHouseFlex, bothHouseFlexRhythm } from './upsells';
import { houseCheckout, houseStay, STAY_EMERGENCY } from './house-stay';
import { agreementLine, agreementTopicLine, visitorLine, visitorQuestion } from './stay-agreement';
import { eventHoldLine, houseRules, petRuleLine, quietHoursSentence } from './house-rules';
import { buildMarketBoard } from './market/board';
import { chooseComps } from './market/comps';
import { amenityDeskLine } from './market/amenities';
import { compFitSummary } from './market/comp-fit';
import { addDays, denverToday } from './market/dates';
import { rateGuardLine } from './market/whatif';
import { rateCardHouses, rateCardHousesNote } from './rate-week';
import { publishedStayRule } from './quote';
import { publishedShortestLine } from './shortest-stay';
import { publishedLengths, stayLengths } from './stay-lengths';
import { bothHouseEventPlans, eventPlanCompare, eventPlans } from './event-plan';
import { housePickLine, partyDeskAnswer } from './house-search';
import { NAMED_EVENTS } from './market/events';
import { denverHour, quietNow } from './stay-rhythm';
import { standingTurnLine } from './turn-clock';
import type { HouseId } from './market/types';

const HOUSES: HouseId[] = ['river', 'ranch', 'lindon'];

const NAME: Record<HouseId, string> = {
  river: 'The River House',
  ranch: 'The Ranch House',
  lindon: 'The Lindon House',
};

const CLOSED = 'This desk does not send a message.';

function namedHouses(question: string): HouseId[] {
  const found: HouseId[] = [];
  if (/\briver\b/.test(question)) found.push('river');
  if (/\branch\b/.test(question)) found.push('ranch');
  if (/\blindon\b/.test(question)) found.push('lindon');
  return found;
}

function firstStayLine(): string {
  const [year, month, day] = RIVER_FIRST_STAY.split('-').map(Number);
  const label = new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return `The River House takes its first stays on ${label}.`;
}

function quietLine(house: HouseId): string {
  return quietHoursSentence(house);
}

function ruleText(house: HouseId, id: string): string | null {
  return houseRules(house).find((rule) => rule.id === id)?.text ?? null;
}

/** The agents desk can name the split. The public house list cannot. No ledger amount. */
function hostSplitAnswer(question: string): string | null {
  const lines: string[] = [];
  const split =
    /\b(todd|split|management)\b/.test(question) ||
    (/\bshare\b/.test(question) && /\b(todd|brandon|owner)\b/.test(question));
  if (split) {
    lines.push(
      'Ranch and River pay a 20% management fee to Brandon first.',
      'What remains splits in half. Todd takes one half. Brandon and Stephanie take the other half.',
      'A loss after the fee splits the same way.',
    );
  }
  if (/\blindon\b/.test(question) && /\b(own|owner|todd|brandon|split)\b/.test(question)) {
    lines.push('Lindon is Brandon’s. It is not on this page.');
  }
  if (/\b(household|construction)\b/.test(question)) {
    lines.push('Household purchases and construction bills are not on this page.');
  }
  if (lines.length === 0) return null;
  lines.push('This desk does not change a booking or a saved expense.');
  const text = lines.join(' ');
  return text.includes('$') ? null : text;
}

/** How many sample comps are close and nearby. No price, and the band stays put. */
function hostCompAnswer(
  question: string,
  asOf: string,
  hidden?: Partial<Record<HouseId, readonly string[]>>,
  pinned?: Partial<Record<HouseId, readonly string[]>>,
): string | null {
  if (!/\b(comp|comps|sample|samples)\b/.test(question)) return null;
  if (!/\b(fair|close|nearby|band|mile|miles)\b/.test(question)) return null;
  const houses = namedHouses(question);
  const scope = houses.length > 0 ? houses : HOUSES;
  const lines = scope.map((house) => {
    const selected = chooseComps(house, {
      pinned: [...(pinned?.[house] ?? [])],
      excluded: [...(hidden?.[house] ?? [])],
    });
    const board = buildMarketBoard(house, asOf, 90, selected);
    return `${NAME[house]}: ${compFitSummary(house, board.comps, 'sample')}`;
  });
  const text = `${lines.join(' ')} This does not change the rate band. Nothing is posted.`;
  return text.includes('$') ? null : text;
}

/** Sample amenity gaps. No price, and the comps are not live listings. */
function hostAmenityAnswer(
  question: string,
  hidden?: Partial<Record<HouseId, readonly string[]>>,
  pinned?: Partial<Record<HouseId, readonly string[]>>,
): string | null {
  if (/\bbroken amenity\b/.test(question) || /\bas-is\b/.test(question) || /\bas is\b/.test(question)) return null;
  const asks =
    /\bamenities\b/.test(question) ||
    /\bamenity gap\b/.test(question) ||
    /\bsample amenity\b/.test(question) ||
    (/\bgaps?\b/.test(question) && /\b(sample|comps?)\b/.test(question) && /\bamenit/.test(question));
  if (!asks) return null;
  const houses = namedHouses(question);
  const scope = houses.length > 0 ? houses : HOUSES;
  const lines = scope.flatMap((house) => {
    const detail = amenityDeskLine(house, hidden?.[house] ?? [], pinned?.[house] ?? []);
    return detail ? [`${NAME[house]}: ${detail}`] : [];
  });
  if (lines.length === 0) return null;
  const text = `${lines.join(' ')} These are sample comps, not live listings. Nothing is posted. This does not change the rate band.`;
  return text.includes('$') ? null : text;
}

/** A ski day, an outdoors day, or a Sunday note from the published guide. No price. */
function dayAnswer(question: string, scope: HouseId[]): string | null {
  const kind: DayKind | null =
    /\bski day\b/.test(question) || (/\bplan\b/.test(question) && /\bski\b/.test(question))
      ? 'ski'
      : /\boutdoors day\b/.test(question) || (/\bplan\b/.test(question) && /\boutdoors\b/.test(question))
        ? 'out'
        : /\bsunday note\b/.test(question) || (/\bplan\b/.test(question) && /\bsunday\b/.test(question))
          ? 'sunday'
          : null;
  if (!kind) return null;
  const lines = scope.map((house) => {
    const day = houseDay(house, kind);
    return `${NAME[house]}: ${day.title}. ${day.lines.join(' ')}`;
  });
  const text = `${lines.join(' ')} This day has no price. ${CLOSED}`;
  if (text.includes('$') || /door\s*code|wi-?fi|password/i.test(text)) {
    return `The door code and Wi-Fi stay off this desk. ${CLOSED}`;
  }
  return text;
}

/** The next seven rate-card nights for every house. No price. */
function weekAnswer(question: string, asOf: string, calendar?: DeskCalendar | null): string | null {
  const asks =
    /\bnext seven\b/.test(question) ||
    /\brate card week\b/.test(question) ||
    (/\bseven nights\b/.test(question) && /\brate card\b/.test(question));
  if (!asks) return null;
  const known = calendar != null;
  const text = `${rateCardHousesNote(known)} ${rateCardHouses(asOf, calendar).join(' ')}`;
  return text.includes('$') ? null : text;
}

/** Rate rules with no nightly amount. A typed dollar ask still stays off. */
function hostRateAnswer(question: string): string | null {
  if (/\b\d{3,}\b/.test(question)) return null;
  const asks =
    /\b(floor|ceiling|published base|lower|promotion|daily cap)\b/.test(question) ||
    (/\b8\b/.test(question) && /\b(percent|cap)\b/.test(question));
  if (!asks) return null;
  const line = rateGuardLine();
  return line.includes('$') ? null : line;
}

const MONTH_NUMBER: Record<string, number> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sept: 9,
  sep: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};

function calendarDay(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const [y, m, d] = iso.split('-').map(Number);
  const back = new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);
  return back === iso ? iso : null;
}

function nextDate(month: number, day: number, asOf: string, year?: number): string | null {
  if (year) return calendarDay(year, month, day);
  const thisYear = Number(asOf.slice(0, 4));
  const upcoming = calendarDay(thisYear, month, day);
  if (!upcoming) return null;
  return upcoming >= asOf ? upcoming : calendarDay(thisYear + 1, month, day);
}

function isoDates(question: string): string[] {
  const found: string[] = [];
  const pattern = /\b(20\d{2}) (\d{2}) (\d{2})\b/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(question))) {
    const iso = calendarDay(Number(match[1]), Number(match[2]), Number(match[3]));
    if (iso) found.push(iso);
  }
  return found;
}

/** Month-and-day stays, plus the older year-month-day form. A missing year uses the next date that has not passed. */
function stayDates(question: string, asOf: string): string[] {
  const numbered = isoDates(question);
  if (numbered.length >= 2) return numbered.slice(0, 2);
  const names = Object.keys(MONTH_NUMBER).sort((a, b) => b.length - a.length).join('|');
  const pattern = new RegExp(`\\b(${names})\\s+(\\d{1,2})(?:\\s+(20\\d{2}))?`, 'g');
  const hits: Array<{ month: number; day: number; year?: number; end: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(question))) {
    hits.push({
      month: MONTH_NUMBER[match[1]!] ?? 0,
      day: Number(match[2]),
      ...(match[3] ? { year: Number(match[3]) } : {}),
      end: match.index + match[0].length,
    });
    if (hits.length === 2) break;
  }
  if (hits.length === 0) return numbered;
  const first = nextDate(hits[0]!.month, hits[0]!.day, asOf, hits[0]!.year);
  if (!first) return numbered;
  if (hits.length === 2) {
    const second = nextDate(hits[1]!.month, hits[1]!.day, asOf, hits[1]!.year);
    return second ? [first, second] : [first];
  }
  const bare = question.slice(hits[0]!.end).match(/\b(?:to|through)\s+(\d{1,2})(?:\s+(20\d{2}))?\b/);
  if (!bare) return [first];
  const year = bare[2] ? Number(bare[2]) : Number(first.slice(0, 4));
  const second = calendarDay(year, hits[0]!.month, Number(bare[1]));
  return second && second > first ? [first, second] : [first];
}

function longDay(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Lengths the rate card can quote from one check-in. A read calendar stops before a booked night. */
function lengthAnswer(question: string, asOf: string, scope: HouseId[], calendar?: DeskCalendar | null): string | null {
  if (!/\b(lengths?|how long|how many nights)\b/.test(question)) return null;
  const dates = stayDates(question, asOf);
  if (dates.length !== 1) return null;
  const checkIn = dates[0]!;
  const lines = scope.map((house) => {
    if (calendar?.closed[house]?.includes(checkIn)) {
      return `${NAME[house]}: ${longDay(checkIn)} is closed on the calendar. Nothing is charged yet.`;
    }
    if (calendar?.taken[house]?.includes(checkIn)) {
      return `${NAME[house]}: ${longDay(checkIn)} is booked. Nothing is charged yet.`;
    }
    const offered = calendar
      ? stayLengths(house, checkIn, calendar.taken[house] ?? [], asOf, 'unknown', undefined, calendar.closed[house] ?? [])
      : publishedLengths(house, checkIn, asOf);
    if (!offered) return `${NAME[house]}: The rate card does not quote a stay from ${longDay(checkIn)}.`;
    const nights = offered.choices.map((choice) => (choice.nights === 1 ? '1 night' : `${choice.nights} nights`)).join(', ');
    return `${NAME[house]}: The rate card can quote ${nights} from ${longDay(checkIn)}. This does not say the house is open. Nothing is charged yet.`;
  });
  const text = lines.join(' ');
  return text.includes('$') ? null : text;
}

const EVENT_SKIP = new Set(['and', 'the', 'weekend', 'through', 'with', 'byu', 'vs']);

function namedEventHits(question: string): string[] {
  const scored = NAMED_EVENTS.map((event) => {
    const words = event.name
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 2 && !EVENT_SKIP.has(word));
    return { name: event.name, score: words.filter((word) => question.includes(word)).length };
  }).filter((row) => row.score > 0);
  const best = Math.max(0, ...scored.map((row) => row.score));
  return scored.filter((row) => row.score === best).map((row) => row.name);
}

/** Upcoming named events when the question does not name one. No price. */
function upcomingEventsLine(
  question: string,
  asOf: string,
  scope: HouseId[],
  calendar?: DeskCalendar | null,
): string | null {
  const wantsAll = /\b(upcoming|coming|list)\b/.test(question) || /\bwhat events\b/.test(question);
  const wantsNext = /\bnext\b/.test(question) && /\bevents?\b/.test(question);
  if (!wantsAll && !wantsNext) return null;
  if (namedEventHits(question).length > 0) return null;
  const rows = eventPlanCompare(asOf, calendar ? { taken: calendar.taken, closed: calendar.closed } : undefined);
  const picked = wantsAll ? rows : rows.slice(0, 1);
  if (picked.length === 0) return 'No named event in the next 180 days. Nothing is charged yet.';
  const lines = picked.map((row) => {
    const parts = row.houses
      .filter((house) => scope.includes(house.house))
      .map((house) => {
        if (house.absent) return `${NAME[house.house]} is not on this event`;
        if (house.hold) return `${NAME[house.house]}: ${house.hold}`;
        if (house.nights == null) return `${NAME[house.house]} cannot quote a start`;
        return `${NAME[house.house]}: ${house.nights === 1 ? '1 night' : `${house.nights} nights`}`;
      });
    return `${row.label}. ${parts.join('. ')}.`;
  });
  const text = `${lines.join(' ')} This does not say a house is open. Nothing is charged yet.`;
  return text.includes('$') ? null : text;
}

/** The shortest stay on a named event. No price, and the house is not called open. */
function eventAnswer(
  question: string,
  asOf: string,
  scope: HouseId[],
  calendar?: DeskCalendar | null,
  pageStay?: DeskPageStay | null,
): string | null {
  if (!/\b(night|nights|stay|event|events|how long)\b/.test(question)) return null;
  const listed = upcomingEventsLine(question, asOf, scope, calendar);
  if (listed) return listed;
  const names = namedEventHits(question);
  if (names.length === 0) return null;
  if (pageStay && typeof pageStay.guests === 'number' && bothHouseQuote(pageStay.guests) && calendar) {
    const nights = bothHouseMonthNights(calendar.taken, calendar.closed);
    const bothPlans = bothHouseEventPlans(asOf, nights).filter((line) => names.some((name) => line.includes(name)));
    if (bothPlans.length > 0) {
      const lines = scope.map((house) => {
        if (house === 'river' || house === 'ranch') {
          return `${NAME[house]}: ${bothPlans.join(' ')}`;
        }
        const plans = eventPlans(house, asOf, { taken: calendar.taken[house] ?? [], closed: calendar.closed[house] ?? [] }).filter((line) =>
          names.some((name) => line.includes(name)),
        );
        if (plans.length === 0) return `${NAME[house]} is not on that event. Nothing is charged yet.`;
        return plans.map((line) => `${NAME[house]}: ${line}`).join(' ');
      });
      const text = lines.join(' ');
      return text.includes('$') ? null : text;
    }
  }
  const lines = scope.map((house) => {
    const plans = eventPlans(house, asOf, calendar ? { taken: calendar.taken[house] ?? [], closed: calendar.closed[house] ?? [] } : undefined).filter((line) =>
      names.some((name) => line.includes(name)),
    );
    if (plans.length === 0) return `${NAME[house]} is not on that event. Nothing is charged yet.`;
    return plans.map((line) => `${NAME[house]}: ${line}`).join(' ');
  });
  const text = lines.join(' ');
  return text.includes('$') ? null : text;
}

function safePickLine(line: string): string {
  if (line.includes('$') || /\bis open\b/.test(line) || /door\s*code|wi-?fi|password/i.test(line)) return 'This stay is not quoted.';
  return line;
}

/** “These dates” answers for houses on the page. A two-house party uses the compound offer. */
function pageStayDatesLines(
  scope: readonly HouseId[],
  stay: Pick<DeskPageStay, 'checkIn' | 'checkOut' | 'guests' | 'children'>,
  calendar: DeskCalendar,
  asOf: string,
): string[] {
  const pair = scope.filter((house) => house === 'river' || house === 'ranch');
  const tail = scope.filter((house) => house === 'lindon');
  if (typeof stay.guests === 'number' && bothHouseQuote(stay.guests) && pair.length > 0) {
    const offer = compoundOffer(
      stay.checkIn,
      stay.checkOut,
      stay.guests,
      stay.children,
      calendar.taken,
      asOf,
      () => 'unknown',
      calendar.closed,
    );
    const combo = !offer.show
      ? 'This party needs the Ranch House and the River House on the booking page.'
      : offer.ok
        ? offer.line
        : offer.reason;
    const safeCombo = safePickLine(combo);
    const parts: string[] = [];
    if (pair.length === 2 && scope.length > 1) {
      parts.push(safeCombo);
    } else if (pair.length === 1) {
      parts.push(`${NAME[pair[0]!]}: ${safeCombo}`);
    } else if (pair.length === 2) {
      parts.push(safeCombo);
    }
    for (const house of tail) {
      const pick = housePickLine(
        house,
        stay.checkIn,
        stay.checkOut,
        calendar.taken[house] ?? [],
        asOf,
        'unknown',
        calendar.closed[house] ?? [],
        stay.guests,
        stay.children,
      );
      parts.push(`${NAME[house]}: ${safePickLine(pick)}`);
    }
    return parts;
  }
  return scope.map((house) => {
    const line = housePickLine(
      house,
      stay.checkIn,
      stay.checkOut,
      calendar.taken[house] ?? [],
      asOf,
      'unknown',
      calendar.closed[house] ?? [],
      stay.guests ?? undefined,
      stay.children,
    );
    const safe = safePickLine(line);
    if (safe.startsWith('The ') || safe.startsWith(`${NAME[house]}:`)) return safe;
    return `${NAME[house]}: ${safe}`;
  });
}

/** A quote search for “these dates” uses the dates on the page. Nothing is sent. */
export function quotePageDateLine(
  question: string,
  house: HouseId,
  checkIn: string,
  checkOut: string,
  calendar: DeskCalendar | null | undefined,
  asOf = denverToday(),
  pending = false,
  party?: Pick<DeskPageStay, 'guests' | 'children'>,
): string | null {
  const q = question.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!q || !asksPageDates(q) || stayDates(q, asOf).length >= 2) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut) || checkOut <= checkIn) return null;
  if (pending) return 'Checking the calendar. Nothing is sent.';
  if (!calendar) return 'The booking calendar could not be read. Nothing is sent.';
  const text = `${pageStayDatesLines([house], { checkIn, checkOut, guests: party?.guests, children: party?.children }, calendar, asOf).join(' ')} Nothing is sent.`;
  if (text.includes('$') || /\bis open\b/.test(text) || /door\s*code|wi-?fi|password/i.test(text)) return 'Nothing is sent.';
  return text;
}

/** The question points at the dates already on the page, and it is not about another guide topic. */
function asksPageDates(question: string): boolean {
  if (/\b(park|parking|swim|tub|towel|trash|dish|smok|vape|grocery|groceries|hike|ski|eat|dinner|meal|address|where|length|lengths|how long|how many nights)\b/.test(question)) {
    return false;
  }
  return /\b(these|those|this) (dates|nights|stay)\b/.test(question);
}

/** An answer from the published house guide. Nothing is sent and no price is quoted. */
export type DeskCalendar = {
  taken: Partial<Record<HouseId, readonly string[]>>;
  closed: Partial<Record<HouseId, readonly string[]>>;
};

export type DeskPageStay = {
  checkIn: string;
  checkOut: string;
  pending?: boolean;
  guests?: number | null;
  children?: number;
};

/** Early or late on the desk when the party needs both houses. No price, and nothing is sent. */
function bothHouseFlexDeskAnswer(
  question: string,
  stay: { checkIn: string; checkOut: string },
  guests: number,
  calendar: DeskCalendar,
  asOf: string,
  children?: number,
): string | null {
  if (!asksEarly(question) && !asksLate(question)) return null;
  const offer = compoundOffer(stay.checkIn, stay.checkOut, guests, children, calendar.taken, asOf, () => 'unknown', calendar.closed);
  if (offer.show && !offer.ok && offer.reason && !offer.reason.includes('$') && !/\bis open\b/.test(offer.reason)) {
    return `${offer.reason} Nothing is sent.`;
  }
  const flex = bothHouseFlex({
    checkIn: stay.checkIn,
    checkOut: stay.checkOut,
    taken: calendar.taken,
    closed: calendar.closed,
  });
  return publicFlexLine(bothHouseFlexRhythm(flex));
}

function heldDeskLine(house: HouseId, checkIn: string, checkOut: string, calendar: DeskCalendar | null | undefined): string | null {
  if (!calendar) return null;
  const taken = new Set(calendar.taken[house] ?? []);
  const closed = new Set(calendar.closed[house] ?? []);
  let booked = false;
  let held = false;
  let cursor = checkIn;
  while (cursor < checkOut) {
    if (taken.has(cursor) && !closed.has(cursor)) booked = true;
    else if (closed.has(cursor)) held = true;
    cursor = addDays(cursor, 1);
  }
  if (booked) return `${NAME[house]}: Those nights are already booked.`;
  if (held) return `${NAME[house]}: Those nights are closed on the calendar.`;
  return null;
}

/** A guide search names a booked or closed span. A free span stays with the guide. */
export function bookedDateLine(
  question: string,
  house: HouseId,
  asOf = denverToday(),
  calendar?: DeskCalendar | null,
): string | null {
  const q = question.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const dates = stayDates(q, asOf);
  if (dates.length < 2) return null;
  const held = heldDeskLine(house, dates[0]!, dates[1]!, calendar);
  if (!held) return null;
  const line = `${held} This search does not send a message.`;
  if (line.includes('$') || /door\s*code|wi-?fi|password/i.test(line) || /\bis open\b/.test(line)) return null;
  return line;
}

export function guideDeskAnswer(
  question: string,
  asOf = denverToday(),
  only?: HouseId,
  host = false,
  hour = denverHour(),
  hidden?: Partial<Record<HouseId, readonly string[]>>,
  calendar?: DeskCalendar | null,
  pageStay?: DeskPageStay | null,
  pinned?: Partial<Record<HouseId, readonly string[]>>,
): string {
  const q = question.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!q) return `Ask about check-in, parking, quiet hours, or how many a house sleeps. ${CLOSED}`;
  if (/\b(wi fi|wifi|password|door code|code)\b/.test(q)) {
    return `The door code and Wi-Fi stay off this desk. ${CLOSED}`;
  }
  if (
    pageStay &&
    calendar &&
    typeof pageStay.guests === 'number' &&
    bothHouseQuote(pageStay.guests) &&
    /^\d{4}-\d{2}-\d{2}$/.test(pageStay.checkIn) &&
    /^\d{4}-\d{2}-\d{2}$/.test(pageStay.checkOut) &&
    pageStay.checkOut > pageStay.checkIn &&
    !pageStay.pending
  ) {
    const both = bothHouseFlexDeskAnswer(q, pageStay, pageStay.guests, calendar, asOf, pageStay.children);
    if (both) return `${both} ${CLOSED}`;
  }
  const thisStay =
    pageStay &&
    /^\d{4}-\d{2}-\d{2}$/.test(pageStay.checkIn) &&
    /^\d{4}-\d{2}-\d{2}$/.test(pageStay.checkOut) &&
    pageStay.checkOut > pageStay.checkIn
      ? { checkIn: pageStay.checkIn, checkOut: pageStay.checkOut }
      : undefined;
  const flex = publicFlexLine(flexStayLine(q, only ?? 'ranch', thisStay, calendar, asOf));
  if (flex) return `${flex} ${CLOSED}`;
  const winter = winterDriveLine(q, only);
  if (winter) return `${winter} ${CLOSED}`;
  if (host && /\b\d{3,}\b/.test(q) && /\b(rate|price|base|floor|ceiling|lower|fee)\b/.test(q)) {
    return `This desk does not quote a price. ${CLOSED}`;
  }
  if (host) {
    const split = hostSplitAnswer(q);
    if (split) return `${split} ${CLOSED}`;
    const guard = hostRateAnswer(q);
    if (guard) return `${guard} ${CLOSED}`;
    const comps = hostCompAnswer(q, asOf, hidden, pinned);
    if (comps) return `${comps} ${CLOSED}`;
    const amenities = hostAmenityAnswer(q, hidden, pinned);
    if (amenities) return `${amenities} ${CLOSED}`;
  }
  const week = weekAnswer(q, asOf, calendar);
  if (week) return `${week} ${CLOSED}`;
  if (/\b(price|priced|cost|rate|dollar|charge|fee)\b/.test(q)) {
    return `This desk does not quote a price. ${CLOSED}`;
  }

  const houses = namedHouses(q);
  const scope = houses.length > 0 ? houses : only ? [only] : HOUSES;

  if (visitorQuestion(q)) {
    const line = visitorLine('page');
    return line ? `${line} ${CLOSED}` : `This desk only answers from the published house guide. ${CLOSED}`;
  }
  if (/\b(agreement|sign)\b/.test(q)) {
    const lines = scope.map((house) => agreementLine(house, 'page'));
    const text = `${lines.join(' ')} ${CLOSED}`;
    if (text.includes('$')) return `This desk does not quote a price. ${CLOSED}`;
    return text;
  }

  if (/\bsame[- ]day\b/.test(q) || (/\bhours\b/.test(q) && /\b(clean|turn|turnover)\b/.test(q))) {
    return `${standingTurnLine('en')} ${CLOSED}`;
  }
  const asksAddress = /\baddress\b/.test(q) || (/\bwhere (is|are)\b/.test(q) && /\b(house|located)\b/.test(q));
  if (asksAddress && !/\b(tub|septic|ski|parking|driveway|grocery|groceries)\b/.test(q)) {
    const lines = scope.map((house) => `${NAME[house]}: ${PROPERTIES[house].address}`);
    return `${lines.join(' ')} ${CLOSED}`;
  }
  if (/\bairport\b/.test(q)) {
    const lines = scope.map((house) => `${NAME[house]}: ${airportSentence(house)}`);
    const text = `${lines.join(' ')} ${CLOSED}`;
    if (text.includes('$') || /door\s*code|wi-?fi|password/i.test(text) || /\bis open\b/.test(text)) {
      return `This desk only answers from the published house guide. ${CLOSED}`;
    }
    return text;
  }
  const directionHits = scope.flatMap((house) => guideDirectionHits(q, house));
  if (directionHits.length > 0) {
    const lines = directionHits.map((hit) => `${NAME[hit.house]} ${hit.title}: ${hit.text}`);
    const text = `${lines.join(' ')} ${CLOSED}`;
    if (text.includes('$') || /door\s*code|wi-?fi|password/i.test(text)) {
      return `The door code and Wi-Fi stay off this desk. ${CLOSED}`;
    }
    return text;
  }
  const nearbyHits = scope.flatMap((house) => guideNearbyHits(q, house));
  if (nearbyHits.length > 0) {
    const lines = nearbyHits.map((hit) => `${NAME[hit.house]} ${hit.title}: ${hit.text}`);
    const text = `${lines.join(' ')} ${CLOSED}`;
    if (text.includes('$') || /door\s*code|wi-?fi|password/i.test(text) || /\bis open\b/.test(text)) {
      return `The published guide does not name a place to eat. ${CLOSED}`;
    }
    return text;
  }
  const lengths = lengthAnswer(q, asOf, scope, calendar);
  if (lengths) return `${lengths} ${CLOSED}`;
  const events = eventAnswer(q, asOf, scope, calendar, pageStay);
  if (events) return `${events} ${CLOSED}`;

  const dates = stayDates(q, asOf);
  if (
    dates.length < 2 &&
    pageStay &&
    asksPageDates(q) &&
    /^\d{4}-\d{2}-\d{2}$/.test(pageStay.checkIn) &&
    /^\d{4}-\d{2}-\d{2}$/.test(pageStay.checkOut) &&
    pageStay.checkOut > pageStay.checkIn
  ) {
    if (pageStay.pending) return `Checking the calendar. ${CLOSED}`;
    if (!calendar) return `The booking calendar could not be read. ${CLOSED}`;
    const text = `${pageStayDatesLines(scope, pageStay, calendar, asOf).join(' ')} ${CLOSED}`;
    if (text.includes('$') || /\bis open\b/.test(text) || /door\s*code|wi-?fi|password/i.test(text)) {
      return `This desk does not quote a price. ${CLOSED}`;
    }
    return text;
  }
  if (dates.length >= 2) {
    const checkIn = dates[0]!;
    const checkOut = dates[1]!;
    const lines = scope.map((house) => {
      const held = heldDeskLine(house, checkIn, checkOut, calendar);
      if (held) return held;
      const rule = publishedStayRule(house, checkIn, checkOut, undefined, undefined, asOf);
      const shorter = publishedShortestLine(
        house,
        checkIn,
        checkOut,
        asOf,
        undefined,
        calendar?.taken[house] ?? [],
        calendar?.closed[house] ?? [],
      );
      return rule
        ? `${NAME[house]}: ${rule}${shorter ? ` ${shorter}` : ''}`
        : `${NAME[house]} does not fail a published stay rule for those dates. This does not say the house is open.`;
    });
    const text = `${lines.join(' ')} ${CLOSED}`;
    if (text.includes('$')) return `This desk does not quote a price. ${CLOSED}`;
    return text;
  }

  if (/\bfirst stays?\b/.test(q) && (houses.length === 0 || houses.includes('river'))) {
    return `${firstStayLine()} ${CLOSED}`;
  }
  if (/\b(child|children|kids|kid)\b/.test(q)) {
    const count =
      q.match(/\b(\d{1,2})\s+(?:people|person|guests|guest)\b/)?.[1] ??
      q.match(/\b(?:people|person|guests|guest|sleeps)\s+(\d{1,2})\b/)?.[1];
    const kids =
      q.match(/\b(\d{1,2})\s+(?:children|child|kids|kid)\b/)?.[1] ??
      q.match(/\b(?:children|child|kids|kid)\s+(\d{1,2})\b/)?.[1];
    const fit = count ? partyDeskAnswer(scope, count) : '';
    const onlyChildren = Boolean(kids && count && Number(kids) >= Number(count));
    const rule = onlyChildren
      ? 'A stay needs an adult. Children count toward the overnight guests.'
      : 'Children count toward the overnight guests. A stay needs an adult.';
    const text = `${fit ? `${fit} ` : ''}${rule} ${CLOSED}`;
    if (text.includes('$') || /door\s*code|wi-?fi|password/i.test(text) || /\bis open\b/.test(text)) {
      return `${rule} ${CLOSED}`;
    }
    return text;
  }
  if (/\b(sleep|sleeps|people|guests)\b/.test(q)) {
    const count =
      q.match(/\b(\d{1,2})\s+(?:people|person|guests|guest)\b/)?.[1] ??
      q.match(/\b(?:people|person|guests|guest|sleeps)\s+(\d{1,2})\b/)?.[1];
    if (count) {
      const fit = partyDeskAnswer(scope, count);
      if (fit) {
        const text = `${fit} ${CLOSED}`;
        if (!text.includes('$') && !/\bis open\b/.test(text)) return text;
      }
    }
    const lines = scope.map((house) => `${NAME[house]} sleeps ${houseStay(house).sleeps}.`);
    return `${lines.join(' ')} ${CLOSED}`;
  }
  if (/\b(check ?out|checkout)\b/.test(q)) {
    if (/\b(do|list|steps|before|leaving)\b/.test(q)) {
      const lines = scope.map((house) => `${NAME[house]}: ${houseCheckout(house).join(' ')}`);
      const text = `${lines.join(' ')} ${CLOSED}`;
      if (text.includes('$')) return `This desk does not quote a price. ${CLOSED}`;
      return text;
    }
    const time = houseStay(scope[0]).checkOut;
    const same = scope.every((house) => houseStay(house).checkOut === time);
    const line = same
      ? `Checkout is ${time}${scope.length === 1 ? ` at ${NAME[scope[0]]}` : ' at each house'}.`
      : scope.map((house) => `${NAME[house]} checkout is ${houseStay(house).checkOut}.`).join(' ');
    return `${line} ${CLOSED}`;
  }
  if ((/\bbefore\b/.test(q) && /\b(arrive|arrival|check ?in|checkin)\b/.test(q)) || /\barrival steps\b/.test(q)) {
    const lines = scope.map((house) => `${NAME[house]}: ${arriveReady(house).map((step) => step.text).join(' ')}`);
    const text = `${lines.join(' ')} These steps are from the published guide. Nothing is sent. ${CLOSED}`;
    if (text.includes('$') || /door\s*code|wi-?fi|password/i.test(text)) {
      return `The door code and Wi-Fi stay off this desk. ${CLOSED}`;
    }
    return text;
  }
  if (/\b(check ?in|checkin|arrival time)\b/.test(q)) {
    const time = houseStay(scope[0]).checkIn;
    const same = scope.every((house) => houseStay(house).checkIn === time);
    const line = same
      ? `Check-in is ${time}${scope.length === 1 ? ` at ${NAME[scope[0]]}` : ' at each house'}.`
      : scope.map((house) => `${NAME[house]} check-in is ${houseStay(house).checkIn}.`).join(' ');
    return `${line} ${CLOSED}`;
  }
  if (/\b(park|parking|driveway)\b/.test(q)) {
    const lines = scope.map((house) => `${NAME[house]}: ${houseStay(house).parking}`);
    return `${lines.join(' ')} ${CLOSED}`;
  }
  if (/\bquiet\b/.test(q) && /\b(now|tonight)\b/.test(q)) {
    const lines = scope.map((house) => `${NAME[house]}: ${quietNow(house, hour)}`);
    const text = `${lines.join(' ')} ${CLOSED}`;
    return text.includes('$') ? `This desk does not quote a price. ${CLOSED}` : text;
  }
  if (/\bquiet\b/.test(q)) {
    const lines = scope.map((house) => `${NAME[house]}: ${quietLine(house)}`);
    return `${lines.join(' ')} ${CLOSED}`;
  }
  if (/\b(pet|pets|dog|dogs|cat|cats|animal|animals)\b/.test(q)) {
    return `${petRuleLine('desk')} ${CLOSED}`;
  }
  if (/\b(have|host|throw|hold) (a |an )?(party|parties|event|events)\b/.test(q) || /\bparties\b/.test(q)) {
    const lines = scope.map((house) => eventHoldLine(house));
    return `${lines.join(' ')} ${CLOSED}`;
  }
  if (/\b(smok|vape)\b/.test(q)) {
    return `No smoking indoors. ${CLOSED}`;
  }
  if (/\b(insure|insurance|belongings|valuables)\b/.test(q)) {
    const line = agreementTopicLine('belongings');
    return line ? `${line} ${CLOSED}` : `This desk only answers from the published house guide. ${CLOSED}`;
  }
  if (/\b(as-is|as is|broken amenity|cancel)\b/.test(q)) {
    const line = agreementTopicLine('asis');
    return line ? `${line} ${CLOSED}` : `This desk only answers from the published house guide. ${CLOSED}`;
  }
  if (/\b(firework|fireworks|lifeguard)\b/.test(q)) {
    const line = agreementTopicLine('safety');
    return line ? `${line} ${CLOSED}` : `This desk only answers from the published house guide. ${CLOSED}`;
  }
  if (/\b(lease|tenant|tenancy)\b/.test(q)) {
    const line = agreementTopicLine('license');
    return line ? `${line} ${CLOSED}` : `This desk only answers from the published house guide. ${CLOSED}`;
  }
  if (/\b(hot tub|hottub|tub)\b/.test(q)) {
    const lines = scope.map((house) => {
      const rule = ruleText(house, 'tub');
      return rule ? `${NAME[house]}: ${rule}` : `${NAME[house]} does not list a hot tub.`;
    });
    return `${lines.join(' ')} ${CLOSED}`;
  }
  if (/\b(smok(?:e|ing|es|ed)|cigarette|cigarettes)\b/.test(q)) {
    const lines = scope.map((house) => {
      const rule = smokingRuleLine(q, house);
      return rule ? `${NAME[house]}: ${rule}` : `${NAME[house]}: The published guide does not name smoking.`;
    });
    const text = `${lines.join(' ')} ${CLOSED}`;
    if (text.includes('$') || /door\s*code|wi-?fi|password/i.test(text)) {
      return `This desk only answers from the published house guide. ${CLOSED}`;
    }
    return text;
  }
  if (/\bseptic\b/.test(q)) {
    const lines = scope.map((house) => {
      const rule = ruleText(house, 'septic');
      return rule ? `${NAME[house]}: ${rule}` : `${NAME[house]} does not list a septic note.`;
    });
    return `${lines.join(' ')} ${CLOSED}`;
  }
  const swimLines = scope.map((house) => swimFacts(q, house)).filter((line): line is string => Boolean(line));
  if (swimLines.length === scope.length && swimLines.length > 0) {
    const text = `${swimLines.join(' ')} ${CLOSED}`;
    if (text.includes('$') || /door\s*code|wi-?fi|password/i.test(text)) {
      return `This desk only answers from the published house guide. ${CLOSED}`;
    }
    return text;
  }
  if (/\bfire\b/.test(q) && !/\bfireplace\b/.test(q)) {
    return `${STAY_EMERGENCY} ${CLOSED}`;
  }
  if (/\b(bedroom|bedrooms|king suite|king suites)\b/.test(q)) {
    const lines = scope.map((house) => bedroomFact(q, house)).filter((line): line is string => Boolean(line));
    const text = `${lines.join(' ')} ${CLOSED}`;
    if (text.includes('$') || /door\s*code|wi-?fi|password/i.test(text)) {
      return `This desk only answers from the published house guide. ${CLOSED}`;
    }
    return text;
  }
  const day = dayAnswer(q, scope);
  if (day) return day;
  const steps = scope.flatMap((house) => checkoutStepHits(q, house));
  if (steps.length > 0) {
    const lines = steps.map((hit) => `${NAME[hit.house]}: ${hit.text}`);
    const text = `${lines.join(' ')} ${CLOSED}`;
    if (!text.includes('$') && !/door\s*code|wi-?fi|password/i.test(text)) return text;
  }
  const found = keepParkingLines(q, searchHouseManual(q, scope));
  if (found.hits.length > 0) {
    const lines = found.hits.map((hit) => `${NAME[hit.house]} — ${hit.title}. ${hit.text}`);
    const more =
      found.more > 0
        ? ` ${found.more} more ${found.more === 1 ? 'match is' : 'matches are'} on the house page.`
        : '';
    const text = `${lines.join(' ')}${more} ${CLOSED}`;
    if (text.includes('$') || /door\s*code|wi-?fi|password/i.test(text)) {
      return `The door code and Wi-Fi stay off this desk. ${CLOSED}`;
    }
    return text;
  }
  return `This desk only answers from the published house guide. ${CLOSED}`;
}

/** A stay-page answer. Null means the guide does not cover it, so Nora can still be asked. */
export function conciergeGuideAnswer(
  question: string,
  house: HouseId,
  asOf = denverToday(),
  calendar?: DeskCalendar | null,
  stay?: { checkIn: string; checkOut: string },
  hour?: number,
  pending = false,
  party?: Pick<DeskPageStay, 'guests' | 'children'>,
): string | null {
  const trimmed = question.trim();
  if (!trimmed) return null;
  const q = trimmed.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const pageStay: DeskPageStay | undefined = stay
    ? {
        checkIn: stay.checkIn,
        checkOut: stay.checkOut,
        ...(pending ? { pending: true } : {}),
        ...(typeof party?.guests === 'number' ? { guests: party.guests, children: party.children } : {}),
      }
    : undefined;
  if (
    pageStay &&
    typeof pageStay.guests === 'number' &&
    bothHouseQuote(pageStay.guests) &&
    calendar &&
    !pending &&
    (asksEarly(q) || asksLate(q) || asksPageDates(q))
  ) {
    const desk = guideDeskAnswer(trimmed, asOf, house, false, hour, undefined, calendar, pageStay);
    if (!desk.includes('only answers from the published house guide') && !desk.startsWith('Ask about check-in')) {
      return desk;
    }
  }
  if (stay) {
    const found = stayGuideLookup(trimmed, house, stay, hour, calendar);
    if (found.kind === 'secret' || found.kind === 'gap') return found.text;
    if (found.kind === 'hits') {
      const text = found.hits.map((hit) => `${hit.title}: ${hit.text}`).join(' ');
      if (text.includes('$') || /door\s*code|wi-?fi|password/i.test(text)) return 'The door code and Wi-Fi stay off this phone.';
      return text;
    }
  }
  if (pending && stayDates(q, asOf).length >= 2) {
    const line = 'Checking the calendar. Nothing is sent.';
    return line.includes('$') ? null : line;
  }
  const answer = guideDeskAnswer(trimmed, asOf, house, false, hour, undefined, calendar, pageStay);
  if (answer.includes('only answers from the published house guide')) return null;
  if (answer.startsWith('Ask about check-in')) return null;
  return answer;
}
