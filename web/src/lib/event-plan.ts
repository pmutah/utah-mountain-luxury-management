import { PROPERTIES } from './api';
import { housePageHref } from './house-page';
import { RIVER_FIRST_STAY } from './brand';
import { addDays } from './market/dates';
import { eventLabel, NAMED_EVENTS, type NamedEvent } from './market/events';
import type { HouseId } from './market/types';
import { shortestStay } from './shortest-stay';
import { checkInHold } from './stay-calendar';

const HOUSES: HouseId[] = ['river', 'ranch', 'lindon'];

export type EventCompareHouse = {
  house: HouseId;
  name: string;
  nights: number | null;
  checkIn: string | null;
  checkOut: string | null;
  absent: boolean;
  /** Set when the event start cannot be quoted from the booking calendar. */
  hold: string | null;
};

type EventNights = {
  taken?: Partial<Record<HouseId, readonly string[]>>;
  closed?: Partial<Record<HouseId, readonly string[]>>;
};

export type EventCompare = {
  label: string;
  houses: EventCompareHouse[];
};

function longDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function nightsLabel(nights: number): string {
  return nights === 1 ? '1 night' : `${nights} nights`;
}

function upcoming(asOf: string): NamedEvent[] {
  const horizon = addDays(asOf, 180);
  return NAMED_EVENTS.filter((event) => event.end > asOf && event.start < horizon);
}

function startOn(house: HouseId, event: NamedEvent, asOf: string): string | null {
  let start = event.start < asOf ? asOf : event.start;
  if (house === 'river' && start < RIVER_FIRST_STAY) {
    if (event.end <= RIVER_FIRST_STAY) return null;
    start = RIVER_FIRST_STAY;
  }
  return start;
}

function eventStay(
  house: HouseId,
  start: string,
  asOf: string,
  taken: readonly string[],
  closed: readonly string[],
) {
  const stay = shortestStay(house, start, taken, asOf, 'unknown', undefined, closed);
  if (stay) return { stay, hold: null as string | null };
  const hold = checkInHold(start, house, taken, closed, asOf);
  return { stay: null, hold };
}

/** Named events for a party that needs both houses. A night booked at either house is named and is not offered as a quote. */
export function bothHouseEventPlans(asOf: string, nights: { taken: readonly string[]; closed: readonly string[] }): string[] {
  return eventPlans('river', asOf, nights).map((line) =>
    line.replace('The rate card can quote', 'Both houses can quote').replace(' This does not say the house is open.', ''),
  );
}

/** The next event both houses can quote. A booked start at either house stays off. */
export function bothHouseNextEventLine(asOf: string, nights: { taken: readonly string[]; closed: readonly string[] }): string {
  const next = nextQuotedEvent('river', asOf, nights);
  const none = 'No named event both houses can quote. Nothing extra is added for an event. Nothing is charged yet.';
  if (!next) return none;
  const length = next.nights === 1 ? '1 night' : `${next.nights} nights`;
  const line = `Next event both houses can quote: ${next.label}, ${length}. Nothing extra is added for it. Nothing is charged yet.`;
  if (line.includes('$') || /\bis open\b/.test(line)) return none;
  return line;
}

/** Upcoming named events and the shortest stay the rate card can quote. It does not say a night is open. */
export function eventPlans(
  house: HouseId,
  asOf: string,
  nights?: { taken?: readonly string[]; closed?: readonly string[] },
): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return [];
  const lines: string[] = [];
  for (const event of upcoming(asOf)) {
    const start = startOn(house, event, asOf);
    if (!start) continue;
    const { stay, hold } = eventStay(house, start, asOf, nights?.taken ?? [], nights?.closed ?? []);
    const label = eventLabel(event);
    const line = stay
      ? `${label}. The rate card can quote a stay starting ${longDate(start)}, ${nightsLabel(stay.nights)}. This does not say the house is open. Nothing is charged yet.`
      : hold
        ? `${label}. ${hold} Nothing is charged yet.`
        : `${label}. The rate card cannot quote a stay starting ${longDate(start)}. This does not say the house is open. Nothing is charged yet.`;
    if (!line.includes('$') && !/\bis open\b/i.test(hold ?? '')) lines.push(line);
  }
  if (lines.length > 0) return lines;
  return ['No named event in the next 180 days. Nothing extra is added for an event. Nothing is charged yet.'];
}

/** The same events across all three houses. A skipped River event stays off that house only. */
export function eventPlanCompare(asOf: string, nights?: EventNights): EventCompare[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return [];
  return upcoming(asOf)
    .map((event) => ({
      label: eventLabel(event),
      houses: HOUSES.map((house) => {
        const name = PROPERTIES[house]?.name ?? house;
        const start = startOn(house, event, asOf);
        if (!start) return { house, name, nights: null, checkIn: null, checkOut: null, absent: true, hold: null };
        const { stay, hold } = eventStay(
          house,
          start,
          asOf,
          nights?.taken?.[house] ?? [],
          nights?.closed?.[house] ?? [],
        );
        return {
          house,
          name,
          nights: stay?.nights ?? null,
          checkIn: stay ? start : null,
          checkOut: stay?.checkOut ?? null,
          absent: false,
          hold,
        };
      }),
    }))
    .filter((row) => !row.label.includes('$'));
}

/** The next event this house can quote. An event that ends before the River House opens is skipped. */
export function nextQuotedEvent(
  house: HouseId,
  asOf: string,
  nights?: { taken?: readonly string[]; closed?: readonly string[] },
): { label: string; nights: number } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return null;
  for (const event of upcoming(asOf)) {
    const start = startOn(house, event, asOf);
    if (!start) continue;
    const stay = shortestStay(house, start, nights?.taken ?? [], asOf, 'unknown', undefined, nights?.closed ?? []);
    if (!stay) continue;
    return { label: eventLabel(event), nights: stay.nights };
  }
  return null;
}

/** One house tab. No price, and the house is not called open. */
export function houseNextEventLine(
  house: HouseId,
  asOf: string,
  nights?: { taken?: readonly string[]; closed?: readonly string[] },
): string {
  const next = nextQuotedEvent(house, asOf, nights);
  const none = 'No named event this house can quote. Nothing extra is added for an event. Nothing is charged yet.';
  if (!next) return none;
  const length = next.nights === 1 ? '1 night' : `${next.nights} nights`;
  const line = `Next event this house can quote: ${next.label}, ${length}. Nothing extra is added for it. Nothing is charged yet.`;
  return line.includes('$') ? none : line;
}

export type OwnerEventStay = {
  house: 'ranch' | 'river';
  nights: number | null;
  href: string | null;
  line: string;
};

export type OwnerEvent = {
  label: string;
  stays: OwnerEventStay[];
  tail: string;
};

const OWNER_TAIL = 'This does not say a house is open. Nothing is charged yet. Lindon is not on this page.';

/** Ranch and River events for Todd’s page. A quoted stay links to that house. Lindon stays off. No price. */
export function ownerEvents(asOf: string, nights?: EventNights): OwnerEvent[] {
  const rows = eventPlanCompare(asOf, nights);
  if (rows.length === 0) return [{ label: 'No named event in the next 180 days', stays: [], tail: OWNER_TAIL }];
  return rows
    .map((row) => ({
      label: row.label,
      tail: OWNER_TAIL,
      stays: row.houses
        .filter((house) => house.house === 'ranch' || house.house === 'river')
        .map((house) => {
          const quoted = !house.absent && !house.hold && house.nights != null && Boolean(house.checkIn) && Boolean(house.checkOut);
          const href = quoted ? housePageHref(house.house, house.checkIn ?? '', house.checkOut ?? '') : null;
          const line = quoted
            ? `${house.name}: ${house.nights === 1 ? '1 night' : `${house.nights} nights`}.`
            : house.hold
              ? `${house.name}: ${house.hold}`
              : `${house.name} is not on this event.`;
          return { house: house.house as 'ranch' | 'river', nights: house.nights, href, line };
        }),
    }))
    .filter((row) => !row.label.includes('$') && row.stays.every((stay) => !stay.line.includes('$')));
}

/** Ranch and River events for Todd’s page. Lindon stays off. No price. */
export function ownerEventLines(asOf: string): string[] {
  return ownerEvents(asOf)
    .map((event) => `${event.label}. ${event.stays.map((stay) => stay.line).join(' ')} ${event.tail}`)
    .filter((line) => !line.includes('$') && !line.includes('Lindon House'));
}
