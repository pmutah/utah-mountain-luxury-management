import { addDays } from './market/dates';
import { nightAsk } from './market/rates';
import type { HouseId } from './market/types';

export type StayYearKind = 'booked' | 'closed' | 'plain';

export type StayYearDay = { date: string; kind: StayYearKind };

export type StayYearMonth = {
  month: string;
  label: string;
  days: StayYearDay[];
  booked: number;
  closed: number;
  line: string;
};

/** Twelve months of booked and closed nights. A blank night is not a quote. No price. */
export function stayYear(
  house: HouseId,
  asOf: string,
  taken: readonly string[],
  closed: readonly string[],
): StayYearMonth[] {
  const startMonth = asOf.slice(0, 7);
  const takenSet = new Set(taken);
  const closedSet = new Set(closed);
  return Array.from({ length: 12 }, (_, index) => {
    const month = shiftMonth(startMonth, index);
    const days = daysOf(month).map((date) => ({ date, kind: kindOf(house, date, takenSet, closedSet) }));
    const booked = days.filter((day) => day.kind === 'booked').length;
    const closedNights = days.filter((day) => day.kind === 'closed').length;
    const line = `${booked} booked. ${closedNights} closed. A blank night still needs a quote.`;
    return {
      month,
      label: monthLabel(month),
      days,
      booked,
      closed: closedNights,
      line: line.includes('$') || /\bopen\b/.test(line) ? `${booked} booked. ${closedNights} closed.` : line,
    };
  });
}

function kindOf(house: HouseId, date: string, taken: ReadonlySet<string>, closed: ReadonlySet<string>): StayYearKind {
  if (closed.has(date) || nightAsk(house, date).closed) return 'closed';
  if (taken.has(date)) return 'booked';
  return 'plain';
}

function shiftMonth(month: string, offset: number): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + offset, 1));
  return date.toISOString().slice(0, 7);
}

function daysOf(month: string): string[] {
  const [year, monthNumber] = month.split('-').map(Number);
  const end = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const first = `${month}-01`;
  const days = [first];
  let cursor = first;
  while (days.length < end) {
    cursor = addDays(cursor, 1);
    days.push(cursor);
  }
  return days;
}

function monthLabel(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthNumber - 1, 1)).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
