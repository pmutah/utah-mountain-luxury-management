import { partyFits } from './house-stay';
import { addDays, isWeekendNight } from './market/dates';
import { promotionForNight, type YearPace } from './market/fill';
import { approvedGuestRate, type QuotedSheetNight } from './market/rate-sheet';
import { nightAsk } from './market/rates';
import { riverSeasonOn } from './market/seasons';
import type { HouseId } from './market/types';
import { AIRBNB_KEEP } from './revenue-goals';

const CLEANING: Record<HouseId, number> = { ranch: 350, lindon: 160, river: 600 };
export const MAX_NIGHTS = 28;

/** What a guest sees when a night is discounted. Host words stay off this line. */
export function guestPromoLine(count: number): string {
  if (!Number.isInteger(count) || count < 1) return '';
  const line = count === 1 ? 'One night is 20% off.' : `${count} nights are 20% off.`;
  if (/\bfill\b|published base|\$|\bis open\b/i.test(line)) return '';
  return line;
}

export function guestPromoMark(): string {
  const line = '20% off';
  if (/\bfill\b|published base/i.test(line)) return '';
  return line;
}

export type QuotedNight = {
  date: string;
  /** Airbnb guest price for this night. */
  guest: number;
  /** Direct price for this night. Host net, with a guest discount when it applies. */
  direct: number;
  season: string | null;
  promotionPercent: 0 | 20;
  /** True when the host approved this night's price instead of the published card. */
  approved?: boolean;
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
  /** How many nights used a host-approved price instead of the published card. */
  approvedNights: number;
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
  sheet: readonly QuotedSheetNight[] = [],
): QuotedNight {
  const ask = nightAsk(house, iso);
  // A night the host approved is the one place a comp-driven price reaches a guest. The approved
  // rate is a guest price, so the direct price is its host net, and the night takes no promotion:
  // the host already set this price on purpose.
  const approved =
    sheet.length === 0 || taken.includes(iso) || ask.closed
      ? null
      : approvedGuestRate(sheet, iso, { guest: ask.guest, floorGuest: ask.floorGuest });
  if (approved !== null) {
    return {
      date: iso,
      guest: approved,
      direct: Math.round(approved * AIRBNB_KEEP),
      season: ask.season,
      promotionPercent: 0,
      approved: true,
    };
  }
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
  options?: {
    asOf?: string;
    pace?: YearPace;
    guests?: number;
    children?: number;
    closed?: readonly string[];
    /** Host-approved guest rates. A night with none keeps the published card. */
    sheet?: readonly QuotedSheetNight[];
  },
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
    approvedNights: 0,
    minNights: 1,
    ok: false,
    reason,
  });

  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn)) return empty('Choose a check-in.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkOut)) return empty('Choose the check-out morning.');
  if (checkOut <= checkIn) return empty('Check-out has to be after check-in.');
  if (checkIn < asOf) return empty('That check-in has already passed.');

  const dates = stayNights(checkIn, checkOut);
  if (dates.length > MAX_NIGHTS) return empty(`A request can cover up to ${MAX_NIGHTS} nights.`);

  const asks = dates.map((date) => nightAsk(house, date));
  const sheet = options?.sheet ?? [];
  const nights = dates.map((date) => directNight(house, date, taken, asOf, pace, sheet));
  const minNights = Math.max(...asks.map((ask) => ask.minNights));
  const lodging = nights.reduce((sum, night) => sum + night.direct, 0);
  const channelLodging = nights.reduce((sum, night) => sum + night.guest, 0);
  const cleaning = CLEANING[house];
  const promotionNights = nights.filter((night) => night.promotionPercent === 20).length;
  const approvedNights = nights.filter((night) => night.approved === true).length;
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
    approvedNights,
    minNights,
  };

  if (asks.some((ask) => ask.closed)) {
    return { ...priced, lodging: 0, stayTotal: 0, channelLodging: 0, channelTotal: 0, ok: false, reason: 'The River House takes its first stays on November 1, 2026.' };
  }
  const closedNights = options?.closed ?? [];
  if (dates.some((date) => taken.includes(date) || closedNights.includes(date))) {
    const booked = dates.some((date) => taken.includes(date) && !closedNights.includes(date));
    return {
      ...priced,
      ok: false,
      reason: booked ? 'Those nights are already booked.' : 'Those nights are closed on the calendar.',
    };
  }
  if (dates.length < minNights) {
    return { ...priced, ok: false, reason: `This stay needs at least ${minNights} nights.` };
  }
  if (dates.length === 1 && isWeekendNight(dates[0]!) && leadDays(asOf, dates[0]!) > 7) {
    return {
      ...priced,
      ok: false,
      reason: 'A Friday or Saturday by itself needs to be inside 7 days. Otherwise book both weekend nights.',
    };
  }
  if (options?.guests !== undefined) {
    const party = partyFits(house, options.guests, options.children);
    if (!party.ok) return { ...priced, ok: false, reason: party.reason };
  }

  return { ...priced, ok: true, reason: null };
}

const PARTY_RULE = /sleeps|adult|Children are part/;

/** A stay rule that does not read the calendar. A passing stay is not called open. */
export function publishedStayRule(
  house: HouseId,
  checkIn: string,
  checkOut: string,
  guests: number | undefined,
  children: number | undefined,
  asOf: string,
): string | null {
  const quote = quoteStay(house, checkIn, checkOut, [], {
    asOf,
    pace: 'unknown',
    closed: [],
    ...(guests !== undefined ? { guests, ...(children !== undefined ? { children } : {}) } : {}),
  });
  const reason = quote.reason ?? '';
  if (quote.ok || reason.length === 0) return null;
  if (reason.includes('$') || PARTY_RULE.test(reason)) return null;
  if (reason === 'Those nights are already booked.' || reason === 'Those nights are closed on the calendar.') return null;
  return reason;
}

/** Season names in stay order. A repeated season is named once. */
export function seasonNames(nights: readonly { season: string | null }[]): string {
  const names: string[] = [];
  for (const night of nights) {
    if (night.season && names[names.length - 1] !== night.season) names.push(night.season);
  }
  if (names.length <= 1) return names[0] ?? '';
  return names.join(', then ');
}

/** River seasons for these dates. No price, and it does not say the house is open. */
export function seasonSpan(house: HouseId, checkIn: string, checkOut: string): string | null {
  if (house !== 'river') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut) || checkOut <= checkIn) return null;
  const names: string[] = [];
  let cursor = checkIn;
  let walked = 0;
  while (cursor < checkOut && walked < 366) {
    const name = riverSeasonOn(cursor).name;
    if (names[names.length - 1] !== name) names.push(name);
    cursor = addDays(cursor, 1);
    walked += 1;
  }
  if (cursor < checkOut) return null;
  const called = seasonNames(names.map((season) => ({ season })));
  if (!called) return null;
  return `The rate card calls these nights ${called}. The nightly rate follows the rate card. Nothing is charged yet.`;
}

/** How much less this page is than the Airbnb guest total. Nothing is charged. */
export function directSavings(channelTotal: number, stayTotal: number): number | null {
  if (!Number.isFinite(channelTotal) || !Number.isFinite(stayTotal)) return null;
  const saved = Math.round(channelTotal) - Math.round(stayTotal);
  return saved > 0 ? saved : null;
}

function leadDays(asOf: string, iso: string): number {
  const [ay, am, ad] = asOf.split('-').map(Number);
  const [by, bm, bd] = iso.split('-').map(Number);
  return Math.round((Date.UTC(by!, bm! - 1, bd) - Date.UTC(ay!, am! - 1, ad)) / 86_400_000);
}
