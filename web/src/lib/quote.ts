import { addDays } from './market/dates';
import { nightAsk } from './market/rates';
import type { HouseId } from './market/types';

const CLEANING: Record<HouseId, number> = { ranch: 350, lindon: 160, river: 0 };
const MAX_NIGHTS = 28;

export type QuotedNight = {
  date: string;
  guest: number;
  season: string | null;
};

export type StayQuote = {
  house: HouseId;
  checkIn: string;
  checkOut: string;
  nights: QuotedNight[];
  lodging: number;
  cleaning: number;
  /** Lodging plus cleaning. Utah tax is added only after the rate is confirmed. */
  stayTotal: number;
  minNights: number;
  ok: boolean;
  reason: string | null;
};

function stayNights(checkIn: string, checkOut: string): string[] {
  const nights: string[] = [];
  let cursor = checkIn;
  while (cursor < checkOut && nights.length <= MAX_NIGHTS) {
    nights.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return nights;
}

export function quoteStay(
  house: HouseId,
  checkIn: string,
  checkOut: string,
  taken: readonly string[] = [],
): StayQuote {
  const empty = (reason: string): StayQuote => ({
    house,
    checkIn,
    checkOut,
    nights: [],
    lodging: 0,
    cleaning: CLEANING[house],
    stayTotal: 0,
    minNights: 1,
    ok: false,
    reason,
  });

  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut)) {
    return empty('Choose a check-in and a check-out.');
  }
  if (checkOut <= checkIn) return empty('Check-out has to be after check-in.');

  const dates = stayNights(checkIn, checkOut);
  if (dates.length > MAX_NIGHTS) return empty(`A request can cover up to ${MAX_NIGHTS} nights.`);

  const asks = dates.map((date) => ({ date, ask: nightAsk(house, date) }));
  const minNights = Math.max(...asks.map((row) => row.ask.minNights));
  const nights = asks.map((row) => ({
    date: row.date,
    guest: row.ask.guest,
    season: row.ask.season,
  }));
  const lodging = nights.reduce((sum, night) => sum + night.guest, 0);
  const cleaning = CLEANING[house];

  if (asks.some((row) => row.ask.closed)) {
    return {
      house,
      checkIn,
      checkOut,
      nights,
      lodging: 0,
      cleaning,
      stayTotal: 0,
      minNights,
      ok: false,
      reason: 'The River House takes its first stays on November 1, 2026.',
    };
  }
  if (dates.some((date) => taken.includes(date))) {
    return {
      house,
      checkIn,
      checkOut,
      nights,
      lodging,
      cleaning,
      stayTotal: lodging + cleaning,
      minNights,
      ok: false,
      reason: 'Those nights are already booked.',
    };
  }
  if (dates.length < minNights) {
    return {
      house,
      checkIn,
      checkOut,
      nights,
      lodging,
      cleaning,
      stayTotal: lodging + cleaning,
      minNights,
      ok: false,
      reason: `This stay needs at least ${minNights} nights.`,
    };
  }

  return {
    house,
    checkIn,
    checkOut,
    nights,
    lodging,
    cleaning,
    stayTotal: lodging + cleaning,
    minNights,
    ok: true,
    reason: null,
  };
}
