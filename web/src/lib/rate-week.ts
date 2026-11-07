import { addDays } from './market/dates';
import { eventNameOn } from './market/events';
import { nightAsk } from './market/rates';
import type { HouseId } from './market/types';
import { shortestStay } from './shortest-stay';

function label(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function nightsLabel(nights: number): string {
  return nights === 1 ? '1 night' : `${nights} nights`;
}

const HOUSES: HouseId[] = ['river', 'ranch', 'lindon'];
const HOUSE_NAME: Record<HouseId, string> = { river: 'River', ranch: 'Ranch', lindon: 'Lindon' };

export type RateWeekCalendar = {
  taken: Partial<Record<HouseId, readonly string[]>>;
  closed: Partial<Record<HouseId, readonly string[]>>;
};

function weekBit(house: HouseId, iso: string, asOf: string, calendar: RateWeekCalendar | null | undefined): string {
  const taken = calendar?.taken[house]?.includes(iso) ?? false;
  const blocked = calendar?.closed[house]?.includes(iso) ?? false;
  if (calendar && blocked) return `${HOUSE_NAME[house]}: closed`;
  if (calendar && taken) return `${HOUSE_NAME[house]}: booked`;
  const ask = nightAsk(house, iso);
  if (ask.closed) return `${HOUSE_NAME[house]}: not yet`;
  const stay = shortestStay(house, iso, calendar?.taken[house] ?? [], asOf, 'unknown', undefined, calendar?.closed[house] ?? []);
  const length = stay ? nightsLabel(stay.nights) : 'no start';
  return `${HOUSE_NAME[house]}: ${length}`;
}

/** Caption for the three-house rate card. A read calendar marks booked nights. */
export function rateCardHousesNote(known = false): string {
  const mark = known
    ? 'Booked nights and calendar blocks are marked.'
    : 'This does not say which nights are booked or open.';
  return `The next seven nights on the rate card for River, Ranch, and Lindon. ${mark} Nothing is raised. Nothing is posted.`;
}

/** The same seven nights for every house. No price, and nothing is raised. */
export function rateCardHouses(asOf: string, calendar?: RateWeekCalendar | null): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return [];
  const lines: string[] = [];
  let cursor = asOf;
  for (let i = 0; i < 7; i += 1) {
    const event = eventNameOn(cursor);
    const named = event ? ` ${event}.` : '';
    const parts = HOUSES.map((house) => weekBit(house, cursor, asOf, calendar));
    lines.push(`${label(cursor)}.${named} ${parts.join('. ')}. Nothing is raised. Nothing is posted.`);
    cursor = addDays(cursor, 1);
  }
  if (lines.some((line) => line.includes('$') || /\bopen\b/i.test(line))) {
    return lines.map(() => 'Nothing is raised. Nothing is posted.');
  }
  return lines;
}

/** Ranch and River only. Lindon stays off Todd’s page. */
export function ownerRateWeekNote(known = false): string {
  const mark = known
    ? 'Booked nights and calendar blocks are marked.'
    : 'This does not say which nights are booked or open.';
  return `Ranch and River for the next seven nights on the rate card. Lindon is not on this page. ${mark} Nothing is raised. Nothing is posted.`;
}

/** The next seven Ranch and River nights. No price, and nothing is raised. */
export function ownerRateWeek(asOf: string, calendar?: RateWeekCalendar | null): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return [];
  const houses: HouseId[] = ['ranch', 'river'];
  const lines: string[] = [];
  let cursor = asOf;
  for (let i = 0; i < 7; i += 1) {
    const event = eventNameOn(cursor);
    const named = event ? ` ${event}.` : '';
    const parts = houses.map((house) => weekBit(house, cursor, asOf, calendar));
    lines.push(`${label(cursor)}.${named} ${parts.join('. ')}. Nothing is raised. Nothing is posted.`);
    cursor = addDays(cursor, 1);
  }
  if (lines.some((line) => line.includes('$') || line.includes('Lindon') || /\bopen\b/i.test(line))) {
    return lines.map(() => 'Nothing is raised. Nothing is posted.');
  }
  return lines;
}

/** The next seven rate-card nights. No price, and nothing is raised. */
export function rateCardWeek(house: HouseId, asOf: string): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return [];
  const lines: string[] = [];
  let cursor = asOf;
  for (let i = 0; i < 7; i += 1) {
    const ask = nightAsk(house, cursor);
    const event = eventNameOn(cursor);
    const named = event ? ` ${event}.` : '';
    if (ask.closed) {
      lines.push(`${label(cursor)}.${named} Not yet. Nothing is raised. Nothing is posted.`);
    } else {
      const stay = shortestStay(house, cursor, [], asOf, 'unknown');
      const length = stay ? nightsLabel(stay.nights) : 'no start';
      const season = ask.season ? ` ${ask.season}.` : '';
      const holiday = ask.lock ? ' The holiday rate stays.' : '';
      lines.push(`${label(cursor)}.${season} Shortest start ${length}.${named}${holiday} Nothing is raised. Nothing is posted.`);
    }
    cursor = addDays(cursor, 1);
  }
  if (lines.some((line) => line.includes('$'))) {
    return lines.map(() => 'Nothing is raised. Nothing is posted.');
  }
  return lines;
}
