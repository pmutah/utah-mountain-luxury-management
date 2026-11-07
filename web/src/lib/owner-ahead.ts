import type { Reservation } from './api';
import { addDays } from './market/dates';
import { bookableNights } from './market/bookable';
import { channelLabel } from './report';

export type OwnerGap = {
  start: string;
  nights: number;
  until: string;
  startLabel: string;
  untilLabel: string;
  /** False when no stay can cover the stretch. The line must not call it open. */
  bookable: boolean;
};

export type OwnerAheadHouse = {
  id: 'ranch' | 'river';
  name: string;
  inHouse: number;
  coming: number;
  nights: number;
  nextArrival: string | null;
  gaps: OwnerGap[];
};

export type AheadChannel = {
  name: string;
  stays: number;
};

export type OwnerAhead = {
  asOf: string;
  houses: OwnerAheadHouse[];
  channels: AheadChannel[];
};

const HOUSES = [
  { id: 'ranch', name: 'Ranch' },
  { id: 'river', name: 'River' },
] as const;

function longDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function nightsLeft(checkIn: string, checkOut: string, asOf: string): number {
  let cursor = checkIn > asOf ? checkIn : asOf;
  let nights = 0;
  while (cursor < checkOut && nights < 400) {
    nights += 1;
    cursor = addDays(cursor, 1);
  }
  return nights;
}

const HORIZON_NIGHTS = 120;

function shortDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export type ClosedSpan = { propertyId: string; start: string; end: string };

function openGaps(
  houseId: 'ranch' | 'river',
  stays: readonly AheadStay[],
  asOf: string,
  closed: readonly ClosedSpan[],
): OwnerGap[] {
  const horizon = addDays(asOf, HORIZON_NIGHTS);
  const taken = new Set<string>();
  const mark = (start: string, end: string) => {
    let night = start > asOf ? start : asOf;
    while (night < end && night < horizon) {
      taken.add(night);
      night = addDays(night, 1);
    }
  };
  for (const stay of stays) {
    if (stay.propertyId !== houseId || stay.status === 'cancelled') continue;
    if (!isDate(stay.checkIn) || !isDate(stay.checkOut) || stay.checkOut <= stay.checkIn || stay.checkOut <= asOf) continue;
    mark(stay.checkIn, stay.checkOut);
  }
  for (const block of closed) {
    if (block.propertyId !== houseId || !isDate(block.start) || !isDate(block.end) || block.end <= block.start) continue;
    mark(block.start, block.end);
  }
  const found: OwnerGap[] = [];
  let cursor = houseId === 'river' && asOf < '2026-11-01' ? '2026-11-01' : asOf;
  while (cursor < horizon && found.length < 2) {
    if (taken.has(cursor)) {
      cursor = addDays(cursor, 1);
      continue;
    }
    const start = cursor;
    let nights = 0;
    while (cursor < horizon && !taken.has(cursor)) {
      nights += 1;
      cursor = addDays(cursor, 1);
    }
    const until = cursor;
    const dates: string[] = [];
    let night = start;
    while (night < until) {
      dates.push(night);
      night = addDays(night, 1);
    }
    const bookable = bookableNights(houseId, dates, [...taken], asOf, 'unknown');
    found.push({
      start,
      nights,
      until,
      startLabel: longDate(start),
      untilLabel: longDate(until),
      bookable: dates.some((date) => bookable.has(date)),
    });
  }
  return found;
}

function bookedAs(source: string | undefined): string {
  const label = channelLabel(source ?? '');
  if (label !== 'Other') return label;
  const trimmed = (source ?? '').trim().replace(/\s+/g, ' ');
  if (!trimmed || trimmed.length > 32) return 'Unlisted';
  return trimmed;
}

function channelCounts(stays: readonly AheadStay[]): AheadChannel[] {
  const counts = new Map<string, number>();
  for (const stay of stays) {
    const name = bookedAs(stay.source);
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const rank = (name: string) => (name === 'Airbnb' ? 0 : name === 'VRBO' ? 1 : 2);
  return [...counts.entries()]
    .map(([name, stays]) => ({ name, stays }))
    .sort((a, b) => rank(a.name) - rank(b.name) || b.stays - a.stays || a.name.localeCompare(b.name));
}

function isDate(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

type AheadStay = Pick<Reservation, 'propertyId' | 'checkIn' | 'checkOut'> & { status?: string; source?: string };

function stillOn(stay: AheadStay, asOf: string, houseId?: string): boolean {
  return (
    (houseId === undefined || stay.propertyId === houseId) &&
    (stay.propertyId === 'ranch' || stay.propertyId === 'river') &&
    stay.status !== 'cancelled' &&
    stay.status !== 'blocked' &&
    isDate(stay.checkIn) &&
    isDate(stay.checkOut) &&
    stay.checkOut > stay.checkIn &&
    stay.checkOut > asOf
  );
}

/** Ranch and River stays that still have a night left. Names and payouts are not copied. */
export function ownerAhead(stays: readonly AheadStay[], asOf: string, closed: readonly ClosedSpan[] = []): OwnerAhead {
  const houses = HOUSES.map((house) => {
    const mine = stays.filter((stay) => stillOn(stay, asOf, house.id));
    const coming = mine.filter((stay) => stay.checkIn > asOf);
    const next = coming.map((stay) => stay.checkIn).sort()[0] ?? null;
    return {
      id: house.id,
      name: house.name,
      inHouse: mine.filter((stay) => stay.checkIn <= asOf).length,
      coming: coming.length,
      nights: mine.reduce((sum, stay) => sum + nightsLeft(stay.checkIn, stay.checkOut, asOf), 0),
      nextArrival: next ? longDate(next) : null,
      gaps: openGaps(house.id, stays, asOf, closed),
    };
  });
  const counted = stays.filter((stay) => stillOn(stay, asOf));
  return { asOf, houses, channels: channelCounts(counted) };
}

export function aheadLine(house: OwnerAheadHouse): string {
  const inHouse = house.inHouse === 1 ? '1 stay in the house' : `${house.inHouse} stays in the house`;
  const coming = house.coming === 1 ? '1 still to come' : `${house.coming} still to come`;
  const nights = house.nights === 1 ? '1 night left' : `${house.nights} nights left`;
  const next = house.nextArrival ? ` Next arrival ${house.nextArrival}.` : '';
  return `${house.name}: ${inHouse}, ${coming}, ${nights}.${next}`;
}

/** Where the stays still on the books were booked. Counts only. No payouts. */
export function aheadChannelsLine(ahead: OwnerAhead): string {
  const parts = ahead.channels
    .filter((channel) => channel.stays > 0)
    .map((channel) => `${channel.stays} ${channel.name}`);
  if (parts.length === 0) return 'Nothing still on the books.';
  return `Where they booked: ${parts.join(', ')}.`;
}

export function gapLine(name: string, gap: OwnerGap): string {
  const nights = gap.nights === 1 ? '1 night' : `${gap.nights} nights`;
  if (!gap.bookable) {
    return `${name} ${gap.startLabel} for ${nights} cannot be booked. The published rate stays. This does not say the house is open.`;
  }
  return `${name} is open ${gap.startLabel} for ${nights}, until ${gap.untilLabel}.`;
}

/** First open stretch on Ranch and River. No payouts. */
export function gapBrief(ahead: OwnerAhead): string {
  const parts = ahead.houses.map((house) => {
    const gap = house.gaps[0];
    if (!gap) return `${house.name} has no open stretch in the next 120 nights`;
    const nights = gap.nights === 1 ? '1 night' : `${gap.nights} nights`;
    if (!gap.bookable) return `${house.name} ${shortDate(gap.start)} for ${nights} cannot be booked`;
    return `${house.name} ${shortDate(gap.start)} for ${nights}`;
  });
  return `Open stretch on the calendar: ${parts.join('. ')}.`;
}
