import { buildMarketBoard } from './board';
import { addDays } from './dates';
import { eventLine } from './events';
import type { SampleComp } from './fixtures';
import { nightAsk } from './rates';
import type { HouseId } from './types';

export type HeatKind = 'booked' | 'closed' | 'open' | 'above' | 'below';

export type HeatDay = { date: string; kind: HeatKind };

export type HeatMonth = {
  month: string;
  label: string;
  days: HeatDay[];
  booked: number;
  closed: number;
  open: number;
  above: number;
  below: number;
  line: string;
  events: string;
  minimum: string;
};

/** Twelve months from the month that contains `asOf`. Counts only. No prices. */
export function yearHeat(
  house: HouseId,
  asOf: string,
  taken: readonly string[],
  closed: readonly string[],
  comps: readonly SampleComp[],
): HeatMonth[] {
  const startMonth = asOf.slice(0, 7);
  const start = `${startMonth}-01`;
  const lastMonth = shiftMonth(startMonth, 11);
  const end = lastDay(lastMonth);
  const span = daysFrom(start, end);
  const board = comps.length > 0 ? buildMarketBoard(house, start, span, [...comps]) : null;
  const byDate = new Map(board?.nights.map((night) => [night.date, night]) ?? []);
  const takenSet = new Set(taken);
  const closedSet = new Set(closed);
  return Array.from({ length: 12 }, (_, index) => {
    const month = shiftMonth(startMonth, index);
    const days = daysOf(month).map((date) => ({ date, kind: kindOf(house, date, takenSet, closedSet, byDate) }));
    const count = (kind: HeatKind) => days.filter((day) => day.kind === kind).length;
    const booked = count('booked');
    const closedNights = count('closed');
    const open = count('open');
    const above = count('above');
    const below = count('below');
    return {
      month,
      label: monthLabel(month),
      days,
      booked,
      closed: closedNights,
      open,
      above,
      below,
      line: `${booked} booked · ${closedNights} closed · ${open} inside the sample band · ${above} above it · ${below} below it`,
      events: eventLine(month),
      minimum: minimumLine(house, month),
    };
  });
}

function minimumLine(house: HouseId, month: string): string {
  const nights = daysOf(month)
    .map((date) => nightAsk(house, date))
    .filter((ask) => !ask.closed)
    .map((ask) => ask.minNights);
  if (nights.length === 0) return 'No stay starts this month.';
  const shortest = Math.min(...nights);
  const longest = Math.max(...nights);
  const unit = (count: number) => (count === 1 ? 'night' : 'nights');
  if (shortest === longest) return `A stay this month is at least ${shortest} ${unit(shortest)}.`;
  return `A stay this month is at least ${shortest} ${unit(shortest)}. Some nights ask for ${longest}.`;
}

function kindOf(
  house: HouseId,
  date: string,
  taken: ReadonlySet<string>,
  closed: ReadonlySet<string>,
  byDate: Map<string, { ourGuest: number; p25: number; p75: number }>,
): HeatKind {
  if (closed.has(date) || nightAsk(house, date).closed) return 'closed';
  if (taken.has(date)) return 'booked';
  const row = byDate.get(date);
  if (!row) return 'open';
  if (row.ourGuest > row.p75) return 'above';
  if (row.ourGuest < row.p25) return 'below';
  return 'open';
}

function shiftMonth(month: string, offset: number): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + offset, 1));
  return date.toISOString().slice(0, 7);
}

function lastDay(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, monthNumber, 0));
  return date.toISOString().slice(0, 10);
}

function daysOf(month: string): string[] {
  const end = Number(lastDay(month).slice(8));
  return Array.from({ length: end }, (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`);
}

function daysFrom(start: string, end: string): number {
  let count = 1;
  let cursor = start;
  while (cursor < end && count < 400) {
    cursor = addDays(cursor, 1);
    count += 1;
  }
  return count;
}

function monthLabel(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthNumber - 1, 1)).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
