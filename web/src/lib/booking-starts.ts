import { addDays, isWeekendNight } from './market/dates';
import type { YearPace } from './market/fill';
import { nightAsk } from './market/rates';
import type { HouseId } from './market/types';
import { shortestStay } from './shortest-stay';

const LABEL: Record<HouseId, string> = { river: 'River', ranch: 'Ranch', lindon: 'Lindon' };

function shortDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function when(first: string, last: string): string {
  return first === last ? shortDate(first) : `${shortDate(first)}–${shortDate(last)}`;
}

type Span = { first: string; last: string; nights: number | null };

function pushSpan(spans: Span[], iso: string, nights: number | null) {
  const last = spans[spans.length - 1];
  if (last && last.nights === nights && addDays(last.last, 1) === iso) {
    last.last = iso;
    return;
  }
  spans.push({ first: iso, last: iso, nights });
}

/**
 * Where the booking calendar asks for more than the rate card, or cannot start a stay.
 * Weekend nights that show 2 until they are inside 7 days are counted, not listed one by one.
 */
export function bookingStartSummary(
  house: HouseId,
  taken: readonly string[],
  asOf: string,
  pace: YearPace,
  days = 90,
  closed: readonly string[] = [],
): string {
  let weekends = 0;
  const longer: Span[] = [];
  const tooShort: Span[] = [];
  for (let offset = 0; offset < days; offset += 1) {
    const iso = addDays(asOf, offset);
    const ask = nightAsk(house, iso);
    if (ask.closed || taken.includes(iso) || closed.includes(iso)) continue;
    const start = shortestStay(house, iso, taken, asOf, pace, undefined, closed)?.nights ?? null;
    if (start === null) {
      pushSpan(tooShort, iso, null);
      continue;
    }
    if (start === 2 && ask.minNights <= 1 && isWeekendNight(iso)) {
      weekends += 1;
      continue;
    }
    if (start > ask.minNights) pushSpan(longer, iso, start);
  }
  const parts: string[] = [];
  if (weekends > 0) parts.push(`${weekends} weekend nights show 2 nights until they are inside 7 days`);
  for (const span of longer) parts.push(`${when(span.first, span.last)} starts at ${span.nights} nights`);
  for (const span of tooShort) parts.push(`${when(span.first, span.last)} cannot start a stay`);
  if (parts.length === 0) return '';
  return `${LABEL[house]}: ${parts.join('. ')}.`;
}
