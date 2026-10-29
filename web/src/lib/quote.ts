import { addDays } from './market/dates';
import { promotionForNight, type YearPace } from './market/fill';
import { nightAsk } from './market/rates';
import type { HouseId } from './market/types';

const CLEANING: Record<HouseId, number> = { ranch: 350, lindon: 160, river: 0 };
const MAX_NIGHTS = 28;

export type QuotedNight = {
  date: string;
  /** Airbnb guest price for this night. */
  guest: number;
  /** Direct price for this night. Host net, with the fill rate when it applies. */
  direct: number;
  season: string | null;
  promotionPercent: 0 | 20;
};

export type StayQuote = {
  house: HouseId;
  checkIn: string;
  checkOut: string;
  nights: QuotedNight[];
  /** Direct lodging. This is what a guest pays on this page. */
  lodging: number;
  cleaning: number;
  /** Direct lodging plus cleaning. Utah tax is added only after the rate is confirmed. */
  stayTotal: number;
  channelLodging: number;
  channelTotal: number;
  promotionNights: number;
  minNights: number;
  ok: boolean;
  reason: string | null;
};

export function directNight(
  house: HouseId,
  iso: string,
  taken: readonly string[],
  asOf: string,
  pace: YearPace,
): QuotedNight {
  const ask = nightAsk(house, iso);
  if (taken.includes(iso) || ask.closed) {
    return { date: iso, guest: ask.guest, direct: ask.host, season: ask.season, promotionPercent: 0 };
  }
  const decision = promotionForNight({
    date: iso,
    asOf,
    holiday: ask.lock,
    ourGuest: ask.host,
    floorGuest: ask.floorHost,
    taken: new Set(taken),
    pace,
  });
  return {
    date: iso,
    guest: ask.guest,
    direct: decision.percent === 20 ? decision.offerGuest : ask.host,
    season: ask.season,
    promotionPercent: decision.percent,
  };
}

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
  options?: { asOf?: string; pace?: YearPace },
): StayQuote {
  const asOf = options?.asOf && /^\d{4}-\d{2}-\d{2}$/.test(options.asOf) ? options.asOf : checkIn;
  const pace = options?.pace ?? 'unknown';
  const empty = (reason: string): StayQuote => ({
    house,
    checkIn,
    checkOut,
    nights: [],
    lodging: 0,
    cleaning: CLEANING[house],
    stayTotal: 0,
    channelLodging: 0,
    channelTotal: 0,
    promotionNights: 0,
    minNights: 1,
    ok: false,
    reason,
  });

  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn)) return empty('Choose a check-in.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkOut)) return empty('Choose the check-out morning.');
  if (checkOut <= checkIn) return empty('Check-out has to be after check-in.');

  const dates = stayNights(checkIn, checkOut);
  if (dates.length > MAX_NIGHTS) return empty(`A request can cover up to ${MAX_NIGHTS} nights.`);

  const asks = dates.map((date) => nightAsk(house, date));
  const nights = dates.map((date) => directNight(house, date, taken, asOf, pace));
  const minNights = Math.max(...asks.map((ask) => ask.minNights));
  const lodging = nights.reduce((sum, night) => sum + night.direct, 0);
  const channelLodging = nights.reduce((sum, night) => sum + night.guest, 0);
  const cleaning = CLEANING[house];
  const promotionNights = nights.filter((night) => night.promotionPercent === 20).length;
  const priced = {
    house,
    checkIn,
    checkOut,
    nights,
    lodging,
    cleaning,
    stayTotal: lodging + cleaning,
    channelLodging,
    channelTotal: channelLodging + cleaning,
    promotionNights,
    minNights,
  };

  if (asks.some((ask) => ask.closed)) {
    return { ...priced, lodging: 0, stayTotal: 0, channelLodging: 0, channelTotal: 0, ok: false, reason: 'The River House takes its first stays on November 1, 2026.' };
  }
  if (dates.some((date) => taken.includes(date))) {
    return { ...priced, ok: false, reason: 'Those nights are already booked.' };
  }
  if (dates.length < minNights) {
    return { ...priced, ok: false, reason: `This stay needs at least ${minNights} nights.` };
  }

  return { ...priced, ok: true, reason: null };
}
