import type { Reservation } from './api';
import { occupiedByHouse } from './availability';
import { hostLaterLeavePhrase } from './departure';
import { checkoutNightIsFree } from './journey';
import { comparePhrase } from './also-open';
import { bookingStartSummary } from './booking-starts';
import { codesOpenTomorrow, earlyStayOpen, hostEarlyPhrase } from './house-stay';
import { stayPrepPhrase } from './upsells';
import { agreementBrief } from './stay-agreement';
import { nextOpenPhrase, lengthPhrase, addonPhrase } from './open-arrivals';
import { aheadChannelsLine, gapBrief, ownerAhead, type ClosedSpan } from './owner-ahead';
import type { CleanFix, HouseFix } from './clean-notes';
import { guestLeavingLine, workOrderArrival, workOrderCheckoutParty, workOrderDeparture, workOrderNext, workOrderParty, workOrderWhen } from './clean';
import { arrivalBrief } from './arrival';
import { childBrief, partyBrief } from './note-party';
import { listingOpenLine } from './listing';
import { addDays } from './market/dates';
import type { YearPace } from './market/fill';
import { buildMarketBoard } from './market/board';
import { chooseComps } from './market/comps';
import { amenityGapsForChoice } from './market/amenities';
import { compFitSummary } from './market/comp-fit';
import { nextEventLine } from './market/events';
import { requestClosedLine } from './house-rules';
import { rateCardHouses, rateCardHousesNote, type RateWeekCalendar } from './rate-week';
import { ownerRules } from './owner-rules';
import { runShadow } from './market/shadow';
import { SHADOW_DAYS_REQUIRED } from './market/shadow-log';
import type { HouseId } from './market/types';
import { grossPace, type PaceStay } from './revenue-goals';
import { buildTurnovers } from './today';
import { jobLeaveAt2 } from './turn-clock';
import { turnLoad } from './turn-load';

export type BriefAgent = 'amanda' | 'co-host' | 'nora' | 'muse' | 'build';

export type BriefLine = {
  agent: BriefAgent;
  text: string;
};

function shortDate(iso: string) {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function blankStay(stay: Pick<Reservation, 'id' | 'propertyId' | 'checkIn' | 'checkOut' | 'status'>): Reservation {
  return { ...stay, guestName: '', payout: 0, source: '' };
}

const HOUSES: HouseId[] = ['river', 'ranch', 'lindon'];
const HOUSE_LABEL: Record<HouseId, string> = { river: 'River', ranch: 'Ranch', lindon: 'Lindon' };

/** The sample amenity our guide does not list, for each house. A hidden comp is left out. No price. */
function amenityBriefLines(
  hidden?: Partial<Record<HouseId, readonly string[]>>,
  pinned?: Partial<Record<HouseId, readonly string[]>>,
): BriefLine[] {
  return HOUSES.flatMap((house) => {
    const top = amenityGapsForChoice(house, hidden?.[house] ?? [], pinned?.[house] ?? []).find((row) => !row.ours && row.listed > 0);
    if (!top || top.line.includes('$')) return [];
    return [
      {
        agent: 'co-host' as const,
        text: `${HOUSE_LABEL[house]}: ${top.line} These are sample comps, not live listings. Nothing is posted. This does not change the rate band.`,
      },
    ];
  });
}

/** Sample comps and the next named event. No night is priced from the books. */
function sampleDesk(
  asOf: string,
  hidden?: Partial<Record<HouseId, readonly string[]>>,
  pinned?: Partial<Record<HouseId, readonly string[]>>,
): BriefLine[] {
  return [
    { agent: 'co-host', text: nextEventLine(asOf) },
    ...HOUSES.map((house) => {
      const selected = chosenComps(house, hidden, pinned);
      const board = buildMarketBoard(house, asOf, 90, selected);
      return {
        agent: 'co-host' as const,
        text: `${HOUSE_LABEL[house]}: ${compFitSummary(house, board.comps, 'sample')} The published ask stays.`,
      };
    }),
  ];
}

/** A read-only night brief. It does not claim a job or name a guest. */
export function agentBrief(input: {
  asOf: string;
  stays: Array<
    Pick<Reservation, 'id' | 'propertyId' | 'checkIn' | 'checkOut' | 'status' | 'note'> & {
      payout?: number;
      source?: string;
    }
  >;
  shadowDays: number;
  openJobs: number;
  calendarReady: boolean;
  /** The saved list could not be read, so a stand-in list must not be priced. */
  booksPaused?: boolean;
  fixes?: readonly CleanFix[];
  /** A house note saved while no stay was on the list. */
  houseFixes?: readonly HouseFix[];
  closed?: readonly ClosedSpan[];
  /** False when calendar blocks could not be read. Null while that read is still loading. */
  blocksReady?: boolean | null;
  /** Reservation id to a saved arrival window. Omit until the preference cards have loaded. */
  arrivalWindows?: Readonly<Record<string, string | undefined>> | null;
  /** Reservation id to a saved departure time. Omit until the preference cards have loaded. */
  departureWindows?: Readonly<Record<string, string | undefined>> | null;
  /** Comp ids hidden on the market page. They stay out of the sample gap. */
  hiddenComps?: Partial<Record<HouseId, readonly string[]>>;
  /** Comp ids pinned on the market page. A pinned bench comp fills the sample set. */
  pinnedComps?: Partial<Record<HouseId, readonly string[]>>;
  /** Nights-only calendar. Omit until that read succeeds. */
  rateCalendar?: RateWeekCalendar | null;
}): BriefLine[] {
  const calendarReady = input.calendarReady && !input.booksPaused;
  const days = Math.max(0, Math.min(SHADOW_DAYS_REQUIRED, Math.floor(input.shadowDays)));
  const lines: BriefLine[] = [
    {
      agent: 'amanda',
      text:
        days >= SHADOW_DAYS_REQUIRED
          ? `Shadow days ${days} of ${SHADOW_DAYS_REQUIRED} are saved. Hospitable write closed until a write token exists.`
          : days === 0
            ? `Shadow day 0 of ${SHADOW_DAYS_REQUIRED}. Hospitable write closed. Opening this brief or the market page today saves the first day; ${SHADOW_DAYS_REQUIRED} days are needed. Nothing is sent.`
            : `Shadow day ${days} of ${SHADOW_DAYS_REQUIRED}. Hospitable write closed. Open this brief or the market page once a day for ${SHADOW_DAYS_REQUIRED - days} more ${SHADOW_DAYS_REQUIRED - days === 1 ? 'day' : 'days'} to finish the week. Nothing is sent.`,
    },
    ...amenityBriefLines(input.hiddenComps, input.pinnedComps),
    {
      agent: 'co-host',
      text: `${rateCardHousesNote(input.rateCalendar != null)} ${rateCardHouses(input.asOf, input.rateCalendar).join(' ')}`,
    },
  ];
  const blocksReady = input.blocksReady !== false && input.blocksReady !== null;
  if (calendarReady && input.blocksReady === false) {
    lines.push({
      agent: 'co-host',
      text: 'Calendar blocks could not be read. No night is called open. Nothing was written over them.',
    });
  }
  if (calendarReady && blocksReady) {
    lines.push(...shadowBrief(input.asOf, input.stays, input.closed ?? [], input.hiddenComps, input.pinnedComps));
  }
  if (calendarReady && blocksReady) {
    const ahead = ownerAhead(input.stays, input.asOf, input.closed ?? []);
    lines.push({ agent: 'co-host', text: aheadChannelsLine(ahead) });
    lines.push({ agent: 'co-host', text: gapBrief(ahead) });
    lines.push({ agent: 'co-host', text: nextOpenBrief(input.asOf, input.stays, input.closed ?? []) });
    lines.push({ agent: 'co-host', text: lengthBrief(input.asOf, input.stays, input.closed ?? []) });
    lines.push({ agent: 'co-host', text: addonBrief(input.asOf, input.stays, input.closed ?? []) });
    lines.push({ agent: 'co-host', text: startBrief(input.asOf, input.stays, input.closed ?? []) });
    lines.push({ agent: 'co-host', text: compareBrief(input.asOf, input.stays, input.closed ?? []) });
  }

  const turns = calendarReady
    ? buildTurnovers(input.stays.map(blankStay), input.asOf).sort(
        (a, b) => Number(b.gapNights === 0) - Number(a.gapNights === 0) || a.checkout.localeCompare(b.checkout),
      )
    : [];
  if (!calendarReady) {
    lines.push({
      agent: 'co-host',
      text: input.booksPaused
        ? 'Saved bookings could not be read. No night is raised or promoted. Nothing was written over them.'
        : 'Checking the calendar…',
    });
    lines.push(...sampleDesk(input.asOf, input.hiddenComps, input.pinnedComps));
    if (input.booksPaused) {
      lines.push({ agent: 'co-host', text: requestClosedLine() });
      lines.push(...ownerRules().map((text) => ({ agent: 'co-host' as const, text })));
    }
  } else if (turns.length === 0) {
    lines.push({ agent: 'co-host', text: 'No checkouts in the next two weeks.' });
  }
  const shown = turns.slice(0, 4);
  const held = occupiedByHouse(
    [
      ...input.stays
        .filter((stay) => stay.status !== 'cancelled')
        .map((stay) => ({ propertyId: stay.propertyId, checkIn: stay.checkIn, checkOut: stay.checkOut })),
      ...(input.closed ?? []).map((block) => ({ propertyId: block.propertyId, checkIn: block.start, checkOut: block.end })),
    ],
    input.asOf,
    addDays(input.asOf, 120),
  );
  for (const turn of shown) {
    const when = shortDate(turn.checkout);
    const window = workOrderWhen(turn.house, turn.gapNights === 0, 'en');
    const next = workOrderNext(turn.nextCheckIn, turn.gapNights, 'en');
    const party = turn.nextCheckIn ? ` ${workOrderParty(turn.nextGuests, 'en', turn.nextChildren)}` : '';
    const arrival =
      turn.nextCheckIn && input.arrivalWindows
        ? ` ${workOrderArrival(input.arrivalWindows[turn.nextStayId ?? ''], 'en')}`
        : '';
    const departure = input.departureWindows
      ? ` ${workOrderDeparture(input.departureWindows[turn.checkoutStayId], 'en')}`
      : '';
    const leaving = ` ${workOrderCheckoutParty(turn.checkoutGuests, 'en', turn.checkoutChildren)}`;
    const later = blocksReady
      ? ` ${hostLaterLeavePhrase(checkoutNightIsFree(turn.checkout, held[turn.house] ?? []))}`
      : '';
    const early =
      blocksReady && turn.nextCheckIn
        ? ` ${hostEarlyPhrase(earlyStayOpen(turn.nextCheckIn, held[turn.house] ?? [], input.asOf))}`
        : '';
    const prep = turn.nextCheckIn ? ` ${stayPrepPhrase(turn.house, turn.nextCheckIn, input.asOf, 'next')}` : '';
    const text =
      turn.gapNights === 0
        ? `Same-day clean at ${turn.houseName} on ${when}. ${window} ${next}${party}${arrival}${departure}${leaving}${later}${early}${prep}`
        : turn.gapNights === null
          ? `${turn.houseName} checkout ${when}. Nothing booked after it. ${window} ${next}${departure}${leaving}${later}`
          : `${turn.houseName} checkout ${when}. ${turn.gapNights} ${turn.gapNights === 1 ? 'night' : 'nights'} before the next arrival. ${window} ${next}${party}${arrival}${departure}${leaving}${later}${early}${prep}`;
    lines.push({ agent: 'co-host', text });
  }
  if (turns.length > shown.length) {
    lines.push({ agent: 'co-host', text: `${turns.length - shown.length} more checkouts in the next two weeks.` });
  }
  if (calendarReady) {
    const routes = turnLoad(
      turns.map((turn) => ({
        house: turn.house,
        houseName: turn.houseName,
        checkout: turn.checkout,
        clock: {
          sameDay: turn.gapNights === 0,
          leaveAt2: jobLeaveAt2(input.departureWindows?.[turn.checkoutStayId], turn.leaveAt2),
          arriveAt1: turn.arriveAt1,
        },
      })),
    );
    for (const route of routes) {
      if (route.line.includes('$') || /door\s*code|wi-?fi|password/i.test(route.line)) continue;
      lines.push({ agent: 'co-host', text: route.line });
    }
  }
  if (calendarReady) lines.push({ agent: 'co-host', text: guestLeavingLine() });
  if (calendarReady) lines.push({ agent: 'co-host', text: partyBrief(input.stays, input.asOf) });
  if (calendarReady) lines.push({ agent: 'co-host', text: childBrief(input.stays, input.asOf) });
  if (calendarReady && input.arrivalWindows) {
    lines.push({ agent: 'co-host', text: arrivalBrief(input.stays, input.arrivalWindows, input.asOf) });
  }
  for (const fix of (input.fixes ?? []).slice(0, 3)) {
    lines.push({
      agent: 'co-host',
      text: `${fix.house} checkout ${shortDate(fix.checkout)}: ${fix.note}`,
    });
  }
  const HOUSE_FIX = { river: 'The River House', ranch: 'The Ranch House', lindon: 'The Lindon House' } as const;
  for (const fix of input.houseFixes ?? []) {
    if (fix.note.includes('$') || /door\s*code|wi-?fi|password|\b\d{4}\b/i.test(fix.note)) continue;
    lines.push({
      agent: 'co-host',
      text: `${HOUSE_FIX[fix.house]} has a note and no stay is attached: ${fix.note} Nothing was sent.`,
    });
  }

  lines.push({ agent: 'co-host', text: listingOpenLine() });
  if (calendarReady) {
    lines.push({ agent: 'nora', text: codesOpenTomorrow(input.stays, input.asOf, 'brief') });
  }
  lines.push({
    agent: 'nora',
    text: 'Door codes stay hidden until the house rules are read on the guest phone. A printed trip sheet leaves the code on the phone and keeps the house notes and the house rules.',
  });
  lines.push({ agent: 'nora', text: agreementBrief() });
  lines.push({
    agent: 'muse',
    text:
      input.openJobs === 0
        ? 'No shared jobs are open. This page does not claim one.'
        : `${input.openJobs} shared ${input.openJobs === 1 ? 'job is' : 'jobs are'} open. This page does not claim one.`,
  });
  lines.push({
    agent: 'build',
    text: 'River build costs stay in the build chat. This brief does not change partner spend.',
  });
  return lines;
}

const SHADOW_HOUSES: HouseId[] = ['river', 'ranch', 'lindon'];
const SHADOW_LABEL: Record<HouseId, string> = { river: 'River', ranch: 'Ranch', lindon: 'Lindon' };

function withClosed(
  stays: Array<Pick<Reservation, 'propertyId' | 'checkIn' | 'checkOut' | 'status'> & { payout?: number }>,
  closed: readonly ClosedSpan[],
) {
  return [
    ...stays,
    ...closed.map((block) => ({
      propertyId: block.propertyId,
      checkIn: block.start,
      checkOut: block.end,
    })),
  ];
}

function nextOpenBrief(
  asOf: string,
  stays: Array<Pick<Reservation, 'propertyId' | 'checkIn' | 'checkOut' | 'status'> & { payout?: number }>,
  closed: readonly ClosedSpan[],
): string {
  const taken = occupiedByHouse(withClosed(stays, closed), asOf, addDays(asOf, 180));
  const paceStays: PaceStay[] = stays.map((stay) => ({
    propertyId: stay.propertyId,
    checkIn: stay.checkIn,
    checkOut: stay.checkOut,
    status: stay.status,
    payout: Number(stay.payout) || 0,
  }));
  const parts = SHADOW_HOUSES.map((house) => {
    const pace: YearPace = grossPace(house, paceStays, asOf).stillNeeded > 0 ? 'short' : 'met';
    return nextOpenPhrase(house, taken[house], asOf, pace);
  });
  return `Next open arrival from these bookings: ${parts.join('. ')}.`;
}

function lengthBrief(
  asOf: string,
  stays: Array<Pick<Reservation, 'propertyId' | 'checkIn' | 'checkOut' | 'status'> & { payout?: number }>,
  closed: readonly ClosedSpan[],
): string {
  const taken = occupiedByHouse(withClosed(stays, closed), asOf, addDays(asOf, 180));
  const paceStays: PaceStay[] = stays.map((stay) => ({
    propertyId: stay.propertyId,
    checkIn: stay.checkIn,
    checkOut: stay.checkOut,
    status: stay.status,
    payout: Number(stay.payout) || 0,
  }));
  const parts = SHADOW_HOUSES.map((house) => {
    const pace: YearPace = grossPace(house, paceStays, asOf).stillNeeded > 0 ? 'short' : 'met';
    return lengthPhrase(house, taken[house], asOf, pace);
  });
  return `Length choices from these bookings: ${parts.join('. ')}.`;
}

function addonBrief(
  asOf: string,
  stays: Array<Pick<Reservation, 'propertyId' | 'checkIn' | 'checkOut' | 'status'> & { payout?: number }>,
  closed: readonly ClosedSpan[],
): string {
  const taken = occupiedByHouse(withClosed(stays, closed), asOf, addDays(asOf, 180));
  const paceStays: PaceStay[] = stays.map((stay) => ({
    propertyId: stay.propertyId,
    checkIn: stay.checkIn,
    checkOut: stay.checkOut,
    status: stay.status,
    payout: Number(stay.payout) || 0,
  }));
  const parts = SHADOW_HOUSES.map((house) => {
    const pace: YearPace = grossPace(house, paceStays, asOf).stillNeeded > 0 ? 'short' : 'met';
    return addonPhrase(house, taken[house], asOf, pace);
  });
  return `Add-ons from these bookings: ${parts.join('. ')}.`;
}

function compareBrief(
  asOf: string,
  stays: Array<Pick<Reservation, 'propertyId' | 'checkIn' | 'checkOut' | 'status'> & { payout?: number }>,
  closed: readonly ClosedSpan[],
): string {
  const taken = occupiedByHouse(withClosed(stays, closed), asOf, addDays(asOf, 180));
  const paceStays: PaceStay[] = stays.map((stay) => ({
    propertyId: stay.propertyId,
    checkIn: stay.checkIn,
    checkOut: stay.checkOut,
    status: stay.status,
    payout: Number(stay.payout) || 0,
  }));
  const paceFor = (house: HouseId): YearPace => (grossPace(house, paceStays, asOf).stillNeeded > 0 ? 'short' : 'met');
  const closedDates = occupiedByHouse(
    closed.map((block) => ({ propertyId: block.propertyId, checkIn: block.start, checkOut: block.end })),
    asOf,
    addDays(asOf, 180),
  );
  const parts = SHADOW_HOUSES.map((house) => comparePhrase(house, taken, asOf, paceFor, closedDates));
  return `Other houses from these bookings: ${parts.join(' ')}`;
}

function startBrief(
  asOf: string,
  stays: Array<Pick<Reservation, 'propertyId' | 'checkIn' | 'checkOut' | 'status'> & { payout?: number }>,
  closed: readonly ClosedSpan[],
): string {
  const taken = occupiedByHouse(withClosed(stays, closed), asOf, addDays(asOf, 180));
  const paceStays: PaceStay[] = stays.map((stay) => ({
    propertyId: stay.propertyId,
    checkIn: stay.checkIn,
    checkOut: stay.checkOut,
    status: stay.status,
    payout: Number(stay.payout) || 0,
  }));
  const parts = SHADOW_HOUSES.map((house) => {
    const pace: YearPace = grossPace(house, paceStays, asOf).stillNeeded > 0 ? 'short' : 'met';
    return bookingStartSummary(house, taken[house], asOf, pace);
  }).filter((line) => line.length > 0);
  return parts.length > 0
    ? `Booking calendar from these bookings: ${parts.join(' ')}`
    : 'Booking calendar matches the rate card.';
}

function chosenComps(
  house: HouseId,
  hidden?: Partial<Record<HouseId, readonly string[]>>,
  pinned?: Partial<Record<HouseId, readonly string[]>>,
) {
  return chooseComps(house, {
    pinned: [...(pinned?.[house] ?? [])],
    excluded: [...(hidden?.[house] ?? [])],
  });
}

function shadowBrief(
  asOf: string,
  stays: Array<Pick<Reservation, 'propertyId' | 'checkIn' | 'checkOut' | 'status'> & { payout?: number }>,
  closed: readonly ClosedSpan[],
  hidden?: Partial<Record<HouseId, readonly string[]>>,
  pinned?: Partial<Record<HouseId, readonly string[]>>,
): BriefLine[] {
  const taken = occupiedByHouse(withClosed(stays, closed), asOf, addDays(asOf, 90));
  const blocks = occupiedByHouse(
    closed.map((block) => ({ propertyId: block.propertyId, checkIn: block.start, checkOut: block.end })),
    asOf,
    addDays(asOf, 90),
  );
  const paceStays: PaceStay[] = stays.map((stay) => ({
    propertyId: stay.propertyId,
    checkIn: stay.checkIn,
    checkOut: stay.checkOut,
    status: stay.status,
    payout: Number(stay.payout) || 0,
  }));
  return SHADOW_HOUSES.map((house) => {
    const pace: YearPace = grossPace(house, paceStays, asOf).stillNeeded > 0 ? 'short' : 'met';
    const run = runShadow(
      buildMarketBoard(house, asOf, 90, chosenComps(house, hidden, pinned)),
      taken[house],
      false,
      asOf,
      pace,
      blocks[house],
    );
    const counts = run.counts;
    return {
      agent: 'amanda',
      text: `${SHADOW_LABEL[house]}: ${counts.raise} raises, ${counts.promote} promotions, ${counts.booked} booked left alone, ${counts.closed} closed. Nothing sent.`,
    };
  });
}
