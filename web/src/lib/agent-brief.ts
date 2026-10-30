import type { Reservation } from './api';
import { occupiedByHouse } from './availability';
import { nextOpenPhrase, lengthPhrase, addonPhrase } from './open-arrivals';
import { aheadChannelsLine, gapBrief, ownerAhead, type ClosedSpan } from './owner-ahead';
import type { CleanFix } from './clean-notes';
import { workOrderWhen, guestLeavingLine } from './clean';
import { listingOpportunities } from './listing';
import { addDays } from './market/dates';
import type { YearPace } from './market/fill';
import { buildMarketBoard } from './market/board';
import { runShadow } from './market/shadow';
import { SHADOW_DAYS_REQUIRED } from './market/shadow-log';
import type { HouseId } from './market/types';
import { grossPace, type PaceStay } from './revenue-goals';
import { buildTurnovers } from './today';

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

/** A read-only night brief. It does not claim a job or name a guest. */
export function agentBrief(input: {
  asOf: string;
  stays: Array<
    Pick<Reservation, 'id' | 'propertyId' | 'checkIn' | 'checkOut' | 'status'> & { payout?: number; source?: string }
  >;
  shadowDays: number;
  openJobs: number;
  calendarReady: boolean;
  fixes?: readonly CleanFix[];
  closed?: readonly ClosedSpan[];
}): BriefLine[] {
  const days = Math.max(0, Math.min(SHADOW_DAYS_REQUIRED, Math.floor(input.shadowDays)));
  const lines: BriefLine[] = [
    {
      agent: 'amanda',
      text:
        days >= SHADOW_DAYS_REQUIRED
          ? `Shadow days ${days} of ${SHADOW_DAYS_REQUIRED} are on this browser. Hospitable write closed.`
          : `Shadow day ${days} of ${SHADOW_DAYS_REQUIRED}. Hospitable write closed.`,
    },
  ];
  if (input.calendarReady) lines.push(...shadowBrief(input.asOf, input.stays, input.closed ?? []));
  if (input.calendarReady) {
    const ahead = ownerAhead(input.stays, input.asOf, input.closed ?? []);
    lines.push({ agent: 'co-host', text: aheadChannelsLine(ahead) });
    lines.push({ agent: 'co-host', text: gapBrief(ahead) });
    lines.push({ agent: 'co-host', text: nextOpenBrief(input.asOf, input.stays, input.closed ?? []) });
    lines.push({ agent: 'co-host', text: lengthBrief(input.asOf, input.stays, input.closed ?? []) });
    lines.push({ agent: 'co-host', text: addonBrief(input.asOf, input.stays, input.closed ?? []) });
  }

  const turns = input.calendarReady
    ? buildTurnovers(input.stays.map(blankStay), input.asOf).sort(
        (a, b) => Number(b.gapNights === 0) - Number(a.gapNights === 0) || a.checkout.localeCompare(b.checkout),
      )
    : [];
  if (!input.calendarReady) {
    lines.push({ agent: 'co-host', text: 'Checking the calendar…' });
  } else if (turns.length === 0) {
    lines.push({ agent: 'co-host', text: 'No checkouts in the next two weeks.' });
  }
  const shown = turns.slice(0, 4);
  for (const turn of shown) {
    const when = shortDate(turn.checkout);
    const window = workOrderWhen(turn.house, turn.gapNights === 0, 'en');
    const text =
      turn.gapNights === 0
        ? `Same-day clean at ${turn.houseName} on ${when}. ${window}`
        : turn.gapNights === null
          ? `${turn.houseName} checkout ${when}. Nothing booked after it. ${window}`
          : `${turn.houseName} checkout ${when}. ${turn.gapNights} ${turn.gapNights === 1 ? 'night' : 'nights'} before the next arrival. ${window}`;
    lines.push({ agent: 'co-host', text });
  }
  if (turns.length > shown.length) {
    lines.push({ agent: 'co-host', text: `${turns.length - shown.length} more checkouts in the next two weeks.` });
  }
  if (input.calendarReady) lines.push({ agent: 'co-host', text: guestLeavingLine() });
  for (const fix of (input.fixes ?? []).slice(0, 3)) {
    lines.push({
      agent: 'co-host',
      text: `${fix.house} checkout ${shortDate(fix.checkout)}: ${fix.note}`,
    });
  }

  const openListings = listingOpportunities('river').filter((item) => item.status === 'open');
  const openLabel = openListings
    .map((item) => (item.id === 'photos' ? 'photos' : item.id === 'payment' ? 'card payment' : item.title))
    .join(' and ');
  lines.push({
    agent: 'co-host',
    text: openLabel
      ? `Still open on our booking page: ${openLabel}.`
      : 'Our booking page has no open listing items.',
  });
  lines.push({
    agent: 'nora',
    text: 'Door codes stay hidden until the house rules are read on the guest phone. A printed trip sheet leaves the code on the phone and keeps the house notes and the house rules.',
  });
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

function shadowBrief(
  asOf: string,
  stays: Array<Pick<Reservation, 'propertyId' | 'checkIn' | 'checkOut' | 'status'> & { payout?: number }>,
  closed: readonly ClosedSpan[],
): BriefLine[] {
  const taken = occupiedByHouse(withClosed(stays, closed), asOf, addDays(asOf, 90));
  const paceStays: PaceStay[] = stays.map((stay) => ({
    propertyId: stay.propertyId,
    checkIn: stay.checkIn,
    checkOut: stay.checkOut,
    status: stay.status,
    payout: Number(stay.payout) || 0,
  }));
  return SHADOW_HOUSES.map((house) => {
    const pace: YearPace = grossPace(house, paceStays, asOf).stillNeeded > 0 ? 'short' : 'met';
    const run = runShadow(buildMarketBoard(house, asOf, 90), taken[house], false, asOf, pace);
    const counts = run.counts;
    return {
      agent: 'amanda',
      text: `${SHADOW_LABEL[house]}: ${counts.raise} raises, ${counts.promote} promotions, ${counts.booked} booked left alone, ${counts.closed} closed. Nothing sent.`,
    };
  });
}
