import { comparePhrase } from '../also-open';
import { arrivalBrief } from '../arrival';
import { bookingStartSummary } from '../booking-starts';
import { RIVER_FIRST_STAY } from '../brand';
import { serviceBrief } from '../clean';
import { departureBrief } from '../departure';
import { childBrief, partyBrief } from '../note-party';
import { addonPhrase, lengthPhrase } from '../open-arrivals';
import { percentileValue } from './stats';
import { SHADOW_UNREAD } from './shadow-log';
import { bookableNights } from './bookable';
import { compFitSummary } from './comp-fit';
import { nextEventLine } from './events';
import { promotionForNight, type YearPace } from './fill';
import { buildMarketBoard } from './board';
import type { SampleComp } from './fixtures';
import type { HouseId, MarketBoard, NightRow } from './types';

export type GuardAction = NightRow['action'] | 'booked' | 'closed' | 'paused';

export type ShadowNight = Omit<NightRow, 'action'> & { action: GuardAction };

export type ShadowCounts = Record<GuardAction, number>;

export type ShadowRun = {
  house: HouseId;
  paused: boolean;
  nights: ShadowNight[];
  counts: ShadowCounts;
  /** The daily text, ready to send later. This module does not send it. */
  digest: string;
};

const LABEL: Record<HouseId, string> = { river: 'River', ranch: 'Ranch', lindon: 'Lindon' };

function money(value: number) {
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

function shortDate(iso: string) {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function emptyCounts(): ShadowCounts {
  return { hold: 0, raise: 0, promote: 0, locked: 0, booked: 0, closed: 0, paused: 0 };
}

function guardNight(night: NightRow, house: HouseId, taken: Set<string>, paused: boolean, blocked: Set<string>): ShadowNight {
  if (paused) {
    return { ...night, action: 'paused', proposedGuest: night.ourGuest, reason: 'This house is paused. The published rate stays.' };
  }
  if (house === 'river' && night.date < RIVER_FIRST_STAY) {
    return { ...night, action: 'closed', proposedGuest: night.ourGuest, reason: 'The River House is closed this night. The rate stays.' };
  }
  if (blocked.has(night.date)) {
    return { ...night, action: 'closed', proposedGuest: night.ourGuest, reason: 'Closed on the calendar. The rate stays.' };
  }
  if (taken.has(night.date)) {
    return { ...night, action: 'booked', proposedGuest: night.ourGuest, reason: 'Already booked. The rate stays.' };
  }
  return night;
}

export function runShadow(
  board: MarketBoard,
  taken: string[],
  paused: boolean,
  asOf: string,
  pace: YearPace = 'unknown',
  blocked: readonly string[] = [],
): ShadowRun {
  const takenSet = new Set(taken);
  const blockedSet = new Set(blocked);
  const guarded = board.nights.map((night) => guardNight(night, board.house, takenSet, paused, blockedSet));
  /*
   * Nights a guest can actually book, from the same `bookableNights` the booking page uses. A one-night
   * hole at the River House, or a lone Friday with the Saturday taken, reads as open on the board but
   * no stay can start there — so its rate is not a live decision and must not be raised or promoted.
   * This is computed only when the calendar was read: a stand-in night list would invent coverage.
   */
  const bookable = paused
    ? null
    : bookableNights(board.house, board.nights.map((night) => night.date), taken, asOf, pace, blocked);
  const nights = guarded.map((night) => applyFill(night, takenSet, asOf, pace, bookable));
  const counts = emptyCounts();
  for (const night of nights) counts[night.action] += 1;
  const raises = nights.filter((night) => night.action === 'raise');
  const largest = raises.reduce<ShadowNight | null>((best, night) => {
    if (!best) return night;
    return night.proposedGuest - night.ourGuest > best.proposedGuest - best.ourGuest ? night : best;
  }, null);
  const lines = paused
    ? [`UML shadow ${LABEL[board.house]} ${asOf}`, 'Paused. Every night stays at the published rate.']
    : [
        `UML shadow ${LABEL[board.house]} ${asOf}`,
        `Raises ${counts.raise} Â· promotions ${counts.promote} Â· booked left alone ${counts.booked} Â· closed ${counts.closed} Â· held ${counts.hold + counts.locked}`,
        largest
          ? `Largest raise ${shortDate(largest.date)} ${money(largest.ourGuest)} to ${money(largest.proposedGuest)}`
          : 'No raises today.',
        /*
         * Named separately, because "no raises" beside an unbookable night reads as a quiet market
         * rather than a night no stay can reach.
         */
        (() => {
          const stuck = nights.filter((night) => night.reason.startsWith('This night cannot be booked')).length;
          if (stuck === 0) return '';
          return `${stuck} ${stuck === 1 ? 'night' : 'nights'} cannot be booked. The published rate stays.`;
        })(),
        pace === 'met'
          ? 'The year is on the books. No promotions.'
          : pace === 'unknown'
            ? 'Year pace is not loaded, so no promotion is recommended.'
            : 'The year is still short. A promotion is 20% off the base on Airbnb and VRBO.',
      ];
  lines.push('Nothing sent to Hospitable.');
  return { house: board.house, paused, nights, counts, digest: lines.filter((line) => line.length > 0).join('\n') };
}

const PORTFOLIO: HouseId[] = ['river', 'ranch', 'lindon'];

/** One daily text for all three houses. This does not send it. */
export function portfolioDigest(input: {
  asOf: string;
  taken: Record<HouseId, string[]>;
  paused: Record<HouseId, boolean>;
  pace: Record<HouseId, YearPace>;
  calendarLive: boolean;
  comps?: Partial<Record<HouseId, SampleComp[]>>;
  closed?: Record<HouseId, string[]>;
  stays?: readonly {
    id?: string;
    propertyId: string;
    checkIn: string;
    checkOut: string;
    status?: string;
    partySize?: number | null;
    childCount?: number | null;
  }[];
  arrivalWindows?: Readonly<Record<string, string | undefined>> | null;
  departureWindows?: Readonly<Record<string, string | undefined>> | null;
  /** Boards the caller already built with live comps. When given, these are used instead of samples. */
  boards?: Partial<Record<HouseId, MarketBoard>>;
}): string {
  const lines = [`UML shadow ${input.asOf}`];
  /*
   * The next named event sits above the houses, unlinked from any rate: it explains why a stretch may
   * be busier, and nothing extra is charged for it. It is part of the same digest so the desk reads
   * one message rather than two.
   */
  lines.push(nextEventLine(input.asOf));
  /*
   * With the calendar unread, a count of raises would describe nights the app never saw. The house
   * lines are skipped rather than annotated: "3 raises" beside "could not be read" still reads as
   * three raises happened. The event line stays, because a named event is a fact from the rate card
   * and not from the calendar. The party, arrival, and departure lines also stay: they come from the
   * saved stays, not from the calendar, so they are just as true either way.
   */
  const ratesUnread = !input.calendarLive;
  if (ratesUnread) lines.push('The calendar could not be read. No night is raised or promoted.');
  if (!ratesUnread) for (const house of PORTFOLIO) {
    /*
     * Prefer the board the caller already built: the market page holds one per house built from **live**
     * comps. This function used to rebuild each house from `input.comps` alone, which are the sample
     * fixtures — so the page showed a live band in one panel and a daily text computed from invented
     * comps in another. The text read "5 of 10 sample comps" while 19 real comps sat in the store.
     */
    const board = input.boards?.[house] ?? buildMarketBoard(house, input.asOf, 90, input.comps?.[house]);
    const run = runShadow(
      board,
      input.calendarLive ? (input.taken[house] ?? []) : [],
      input.paused[house],
      input.asOf,
      input.pace[house],
      input.calendarLive ? (input.closed?.[house] ?? []) : [],
    );
    // The fit line comes before the pause check: how much of the band is real is true either way, and a
    // paused house still has its comps setting the band it would use. A board carrying saved comps is
    // described as saved, not as samples.
    lines.push(`${LABEL[house]}: ${compFitSummary(house, board.comps, (board.summary?.liveComps ?? 0) > 0 ? 'saved' : 'sample')}`);
    if (run.paused) {
      lines.push(`${LABEL[house]}: paused. Published rates stay.`);
      continue;
    }
    const raises = run.nights.filter((night) => night.action === 'raise');
    const largest = raises.reduce<ShadowNight | null>((best, night) => {
      if (!best) return night;
      return night.proposedGuest - night.ourGuest > best.proposedGuest - best.ourGuest ? night : best;
    }, null);
    const raiseBit = largest
      ? `, largest raise ${shortDate(largest.date)} ${money(largest.ourGuest)} to ${money(largest.proposedGuest)}`
      : '';
    const blocks = run.nights.filter((night) => night.reason.startsWith('Closed on the calendar')).length;
    const blockBit = blocks > 0 ? `, ${blocks} calendar blocks left closed` : '';
    lines.push(
      `${LABEL[house]}: ${run.counts.raise} raises, ${run.counts.promote} promotions, ${run.counts.booked} booked left alone${blockBit}${raiseBit}`,
    );
  }
  if (input.calendarLive) {
    const quote = PORTFOLIO.map((house) => lengthPhrase(house, input.taken[house] ?? [], input.asOf, input.pace[house]));
    const extras = PORTFOLIO.map((house) => addonPhrase(house, input.taken[house] ?? [], input.asOf, input.pace[house]));
    lines.push(`Booking page: ${quote.join('. ')}.`);
    lines.push(`Add-ons: ${extras.join('. ')}.`);
    const starts = PORTFOLIO.map((house) =>
      bookingStartSummary(house, input.taken[house] ?? [], input.asOf, input.pace[house]),
    ).filter((line) => line.length > 0);
    if (starts.length > 0) lines.push(`Booking calendar: ${starts.join(' ')}`);
    const paceFor = (id: HouseId) => input.pace[id];
    lines.push(
      `Other houses: ${PORTFOLIO.map((house) => comparePhrase(house, input.taken, input.asOf, paceFor, input.closed)).join(' ')}`,
    );
  }
  if (input.stays) {
    const rows = input.stays.map((stay) => ({
      id: stay.id ?? '',
      propertyId: stay.propertyId,
      checkIn: stay.checkIn,
      checkOut: stay.checkOut,
      status: stay.status,
      note:
        stay.childCount && stay.childCount >= 1
          ? `${Math.max((stay.partySize ?? stay.childCount) - stay.childCount, 0)} adults Â· ${stay.childCount} ${stay.childCount === 1 ? 'child' : 'children'}`
          : stay.partySize
            ? `${stay.partySize} guests`
            : undefined,
    }));
    lines.push(`Parties: ${partyBrief(rows, input.asOf)}`);
    lines.push(`Children: ${childBrief(rows, input.asOf)}`);
    if (input.arrivalWindows) lines.push(`Arrivals: ${arrivalBrief(rows, input.arrivalWindows, input.asOf)}`);
    if (input.departureWindows) lines.push(`Departures: ${departureBrief(rows, input.departureWindows, input.asOf)}`);
    if (input.calendarLive) lines.push(`Service: ${serviceBrief(input.stays, input.taken, input.asOf)}`);
  }
  lines.push('Nothing sent to Hospitable.');
  return lines.join('\n');
}

function applyFill(
  night: ShadowNight,
  taken: Set<string>,
  asOf: string,
  pace: YearPace,
  bookable: ReadonlySet<string> | null,
): ShadowNight {
  if (night.action === 'booked' || night.action === 'closed' || night.action === 'paused') {
    return { ...night, promotionPercent: 0, offerGuest: night.proposedGuest };
  }
  /*
   * A night no stay can cover keeps the published rate. It reads as open on the board, but every
   * check-in that would include it is refused, so raising or promoting it changes a price nobody can
   * pay. The reason says "cannot be booked" so the desk can tell this apart from a night the floor
   * stopped.
   */
  if (bookable !== null && !bookable.has(night.date)) {
    return {
      ...night,
      action: 'hold',
      proposedGuest: night.ourGuest,
      promotionPercent: 0,
      offerGuest: night.ourGuest,
      reason: 'This night cannot be booked, so the published rate stays.',
    };
  }
  const decision = promotionForNight({
    date: night.date,
    asOf,
    holiday: night.action === 'locked',
    ourGuest: night.proposedGuest,
    floorGuest: night.floorGuest,
    taken,
    pace,
  });
  if (decision.percent === 20) {
    /*
     * A promotion is only worth applying if the discounted price actually reaches the market. The River
     * House proves the case: a 20% cut took $2,486 to $1,989 while the comp cluster's 75th percentile was
     * about $1,480, so the "discount" was still a third above the most expensive comparable and could not
     * fill the night. `promotionForNight` checks pace and lead time but never the market, because it does
     * not receive the band. When the offer stays above p75 the night holds at its base, and the reason says
     * which two numbers forbid the discount.
     */
    const p75 = night.compRates.length >= 3 ? Math.round(percentileValue(night.compRates, 75)) : null;
    if (p75 !== null && decision.offerGuest > p75) {
      return {
        ...night,
        action: 'hold',
        promotionPercent: 0,
        offerGuest: night.proposedGuest,
        reason: `A 20% promotion would be ${money(decision.offerGuest)} and the market's 75th percentile is ${money(p75)}, so the discount would not reach the market. The base stays.`,
      };
    }
    const raised = night.proposedGuest > night.ourGuest;
    return {
      ...night,
      action: 'promote',
      promotionPercent: 20,
      offerGuest: decision.offerGuest,
      reason: raised
        ? `Base ${money(night.ourGuest)} to ${money(night.proposedGuest)}. ${decision.reason}`
        : decision.reason,
    };
  }
  if (night.action === 'locked') {
    return { ...night, promotionPercent: 0, offerGuest: night.proposedGuest };
  }
  const action = night.action === 'promote' ? 'hold' : night.action;
  return {
    ...night,
    action,
    promotionPercent: 0,
    offerGuest: night.proposedGuest,
    reason: night.action === 'promote' ? decision.reason : night.reason,
  };
}

/* ------------------------------------------------------------------------------------------------
 * Calendar-state wording for the desk.
 *
 * Each of these exists so a page can say what it does not know instead of showing a figure. When the
 * calendar could not be read, an ask, a band, or a count of raises would be a stand-in presented as
 * real; these return the sentence that says so, and never a number.
 * ---------------------------------------------------------------------------------------------- */

/** How the market page last read the booking calendar. */
export type CalendarState = 'loading' | 'live' | 'off';

/**
 * The house panel's text. With the calendar unread the digest would describe nights the app never
 * saw, so it is replaced outright rather than annotated â€” a raise count beside "could not be read"
 * still reads as a count.
 */
export function houseShadowText(state: CalendarState, digest: string, compFit: string): string {
  if (state === 'loading') return 'Checking the calendar.';
  if (state === 'off') {
    return `${SHADOW_UNREAD} The rate band and every ask stay off this panel until the calendar is read. Nothing is posted.`;
  }
  return `${digest}\n${compFit}`;
}

/** A count of shadow raises. Unread returns the unread line, so no number is implied. */
export function raiseHint(state: CalendarState, raises: number): string {
  if (state === 'off') return houseShadowText('off', '', '');
  if (state === 'loading') return 'Checking the calendar.';
  return `${raises} shadow ${raises === 1 ? 'raise' : 'raises'}`;
}

/** Why no book-share figure is shown: the stay list could not be read, so it is not zero. */
export function paceUnreadLine(): string {
  return 'The booking pace could not be read, so this is not a stand-in figure. Nothing is raised.';
}

/** Which figure is missing on an unread calendar, said plainly and without a number. */
export function unreadMoneyNote(where: 'ask' | 'band' | 'comp'): string {
  if (where === 'band') return 'The calendar could not be read, so the rate band stays off. Nothing is posted.';
  if (where === 'comp') return 'The calendar could not be read, so the sample ask stays off. Nothing is posted.';
  return 'The calendar could not be read, so this ask is not shown. Nothing is posted.';
}



