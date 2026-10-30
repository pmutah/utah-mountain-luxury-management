import { addDays, isWeekendNight } from './market/dates';
import { nightAsk } from './market/rates';
import type { YearPace } from './market/fill';
import type { HouseId } from './market/types';
import { quoteStay } from './quote';
import { stayLengths } from './stay-lengths';
import { quoteOffers, type UpsellId } from './upsells';

export type OpenArrival = {
  checkIn: string;
  checkOut: string;
  nights: number;
  direct: number;
  label: string;
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

function leadDays(asOf: string, iso: string): number {
  const [ay, am, ad] = asOf.split('-').map(Number);
  const [by, bm, bd] = iso.split('-').map(Number);
  return Math.round((Date.UTC(by!, bm! - 1, bd) - Date.UTC(ay!, am! - 1, ad)) / 86_400_000);
}

/** The next shortest stays this page will quote. Picking one does not hold the dates. */
export function openArrivals(
  house: HouseId,
  taken: readonly string[],
  asOf: string,
  pace: YearPace,
  limit = 3,
): OpenArrival[] {
  const found: OpenArrival[] = [];
  const horizon = addDays(asOf, 180);
  let cursor = asOf;
  while (cursor < horizon && found.length < limit) {
    const ask = nightAsk(house, cursor);
    if (ask.closed || taken.includes(cursor)) {
      cursor = addDays(cursor, 1);
      continue;
    }
    let nights = Math.max(1, ask.minNights);
    if (nights === 1 && isWeekendNight(cursor) && leadDays(asOf, cursor) > 7) nights = 2;
    let quote = quoteStay(house, cursor, addDays(cursor, nights), taken, { asOf, pace });
    if (!quote.ok && quote.minNights > nights && quote.reason?.includes('at least')) {
      nights = quote.minNights;
      quote = quoteStay(house, cursor, addDays(cursor, nights), taken, { asOf, pace });
    }
    if (!quote.ok) {
      cursor = addDays(cursor, 1);
      continue;
    }
    found.push({
      checkIn: quote.checkIn,
      checkOut: quote.checkOut,
      nights: quote.nights.length,
      direct: quote.stayTotal,
      label: `${longDate(quote.checkIn)} · ${quote.nights.length} ${quote.nights.length === 1 ? 'night' : 'nights'}`,
    });
    cursor = quote.checkOut;
  }
  return found;
}

const HOUSE_NAME: Record<HouseId, string> = { river: 'River', ranch: 'Ranch', lindon: 'Lindon' };

/** First open arrival, with no price. The brief can say it. */
export function nextOpenPhrase(house: HouseId, taken: readonly string[], asOf: string, pace: YearPace): string {
  const first = openArrivals(house, taken, asOf, pace, 1)[0];
  const name = HOUSE_NAME[house];
  if (!first) return `${name} has no open arrival in the next six months`;
  const [year, month, day] = first.checkIn.split('-').map(Number);
  const when = new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  const nights = first.nights === 1 ? '1 night' : `${first.nights} nights`;
  return `${name} ${when} for ${nights}`;
}

/** Lengths the booking page can quote from the next open arrival. No price. */
export function lengthPhrase(house: HouseId, taken: readonly string[], asOf: string, pace: YearPace): string {
  const name = HOUSE_NAME[house];
  const first = openArrivals(house, taken, asOf, pace, 1)[0];
  if (!first) return `${name} has no length to quote in the next six months`;
  const [year, month, day] = first.checkIn.split('-').map(Number);
  const when = new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  const lengths = stayLengths(house, first.checkIn, taken, asOf, pace);
  const nights = lengths ? lengths.choices.map((choice) => choice.nights).join(', ') : String(first.nights);
  return `${name} ${when} can quote ${nights} nights`;
}

const SPOKEN: Record<UpsellId, string> = {
  early: 'an early arrival',
  late: 'a later checkout',
  tub: 'the hot tub',
  groceries: 'a grocery drop',
};

function spokenList(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

/** Add-ons the shortest open arrival can request. No price. */
export function addonPhrase(house: HouseId, taken: readonly string[], asOf: string, pace: YearPace): string {
  const name = HOUSE_NAME[house];
  const first = openArrivals(house, taken, asOf, pace, 1)[0];
  if (!first) return `${name} has no add-on to request in the next six months`;
  const [year, month, day] = first.checkIn.split('-').map(Number);
  const when = new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  const offers = quoteOffers({
    house,
    checkIn: first.checkIn,
    checkOut: first.checkOut,
    asOf,
    taken,
    calendarLive: true,
  }).map((offer) => SPOKEN[offer.id]);
  if (offers.length === 0) return `${name} ${when} has no add-on for that stay`;
  return `${name} ${when} can request ${spokenList(offers)}`;
}
