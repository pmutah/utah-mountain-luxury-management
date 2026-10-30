import type { Reservation } from './api';
import { addDays } from './market/dates';
import { channelLabel, type ChannelName } from './report';

export type OwnerGap = {
  start: string;
  nights: number;
  until: string;
  startLabel: string;
  untilLabel: string;
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
  name: ChannelName;
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

function openGaps(houseId: 'ranch' | 'river', stays: readonly AheadStay[], asOf: string): OwnerGap[] {
  const horizon = addDays(asOf, HORIZON_NIGHTS);
  const taken = new Set<string>();
  for (const stay of stays) {
    if (!stillOn(stay, asOf, houseId)) continue;
    let night = stay.checkIn > asOf ? stay.checkIn : asOf;
    while (night < stay.checkOut && night < horizon) {
      taken.add(night);
      night = addDays(night, 1);
    }
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
    found.push({
      start,
      nights,
      until: cursor,
      startLabel: longDate(start),
      untilLabel: longDate(cursor),
    });
  }
  return found;
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
export function ownerAhead(stays: readonly AheadStay[], asOf: string): OwnerAhead {
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
      gaps: openGaps(house.id, stays, asOf),
    };
  });
  const counted = stays.filter((stay) => stillOn(stay, asOf));
  const channels: AheadChannel[] = (['Airbnb', 'VRBO', 'Other'] as const).map((name) => ({
    name,
    stays: counted.filter((stay) => channelLabel(stay.source ?? '') === name).length,
  }));
  return { asOf, houses, channels };
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
    .map((channel) => `${channel.stays} ${channel.name === 'Other' ? 'other' : channel.name}`);
  if (parts.length === 0) return 'Nothing still on the books.';
  return `Where they booked: ${parts.join(', ')}.`;
}

export function gapLine(name: string, gap: OwnerGap): string {
  const nights = gap.nights === 1 ? '1 night' : `${gap.nights} nights`;
  return `${name} is open ${gap.startLabel} for ${nights}, until ${gap.untilLabel}.`;
}

/** First open stretch on Ranch and River. No payouts. */
export function gapBrief(ahead: OwnerAhead): string {
  const parts = ahead.houses.map((house) => {
    const gap = house.gaps[0];
    if (!gap) return `${house.name} has no open stretch in the next 120 nights`;
    const nights = gap.nights === 1 ? '1 night' : `${gap.nights} nights`;
    return `${house.name} ${shortDate(gap.start)} for ${nights}`;
  });
  return `Open stretch from these bookings: ${parts.join('. ')}.`;
}
