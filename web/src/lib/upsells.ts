import { checkoutNightIsFree, nightBeforeIsFree } from './journey';
import type { YearPace } from './market/fill';
import type { HouseId } from './market/types';
import { quoteStay } from './quote';

export type UpsellId = 'early' | 'late' | 'tub' | 'groceries';

export type UpsellOffer = {
  id: UpsellId;
  house: HouseId | 'all';
  name: string;
  detail: string;
  price: number;
};

/** The menu. A request does not charge a card or write the books. */
export const UPSELLS: UpsellOffer[] = [
  {
    id: 'early',
    house: 'all',
    name: 'Arrive at 1:00 PM',
    detail: 'The night before has to be open. The door code still opens the day before check-in.',
    price: 150,
  },
  {
    id: 'late',
    house: 'all',
    name: 'Leave at 2:00 PM',
    detail: 'Offered when no one is arriving on checkout day.',
    price: 150,
  },
  {
    id: 'tub',
    house: 'ranch',
    name: 'Hot tub ready at arrival',
    detail: 'The cover comes off and the tub is warm when you walk in.',
    price: 75,
  },
  {
    id: 'groceries',
    house: 'river',
    name: 'Canyon grocery drop',
    detail: 'We shop in Orem and leave the bags in the kitchen. This is the drop fee. The groceries are extra. The list stays on this phone.',
    price: 40,
  },
];

const IDS: UpsellId[] = ['early', 'late', 'tub', 'groceries'];

export function houseMenu(house: HouseId): UpsellOffer[] {
  return UPSELLS.filter((offer) => offer.house === 'all' || offer.house === house);
}

/**
 * Offers a guest can request for this stay.
 * An unknown calendar hides early arrival and late checkout instead of inventing an open night.
 */
export function guestOffers(input: {
  house: HouseId;
  phase: 'before' | 'during' | 'after';
  nightBeforeFree: boolean | null;
  checkoutNightFree: boolean | null;
}): UpsellOffer[] {
  if (input.phase === 'after') return [];
  return houseMenu(input.house).filter((offer) => {
    if (offer.id === 'early') return input.phase === 'before' && input.nightBeforeFree === true;
    if (offer.id === 'late') return input.checkoutNightFree === true;
    return input.phase === 'before';
  });
}

export function toggleUpsell(current: readonly UpsellId[], id: UpsellId): UpsellId[] {
  return current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
}

/** The host add-on note. An unread guest list does not say a night is open or name a stay. */
export function guestAddonIntro(unreadable: boolean): string {
  const tail = 'Nothing is ordered or charged. This page does not send a request.';
  if (unreadable) {
    return `Saved bookings could not be read. This page does not say which stay can request an add-on, and it does not say a night is open. The menu is the published list. ${tail}`;
  }
  return `Guests can request these from the stay app when the night is open. Each stay below says which of these that stay can request. A request stays on their phone. A grocery list stays on that phone too. ${tail}`;
}

/** Names the add-ons without a price. Early and late wait until the calendar can be read. */
export function addonMenuLine(house: HouseId): string {
  const named = houseMenu(house)
    .filter((offer) => offer.id === 'tub' || offer.id === 'groceries')
    .map((offer) => offer.name);
  const wait = 'An early arrival and a later checkout wait until the calendar can be read.';
  const close = 'This list has no price and does not send a request.';
  if (named.length === 0) return `${wait} ${close}`;
  return `${named.join('. ')}. ${wait} ${close}`;
}

/** Early arrival and a later checkout for a party in both houses. Both calendars have to be clear. */
export function bothHouseFlex(input: {
  checkIn: string;
  checkOut: string;
  taken: Partial<Record<HouseId, readonly string[]>>;
  closed?: Partial<Record<HouseId, readonly string[]>>;
}): { early: boolean; late: boolean } {
  const houses: HouseId[] = ['river', 'ranch'];
  return {
    early: houses.every((id) => nightBeforeIsFree(input.checkIn, input.taken[id] ?? [], input.closed?.[id] ?? [])),
    late: houses.every((id) => checkoutNightIsFree(input.checkOut, input.taken[id] ?? [], input.closed?.[id] ?? [])),
  };
}

/** The request line for both houses. No price and no door-code timing. */
export function bothHouseFlexLine(kind: 'early' | 'late', open: boolean): string {
  const line = !open
    ? kind === 'early'
      ? 'A 1:00 PM arrival is not open for both houses.'
      : 'A 2:00 PM leave is not open for both houses.'
    : kind === 'early'
      ? 'Arrive at 1:00 PM is a request for both houses. Nothing is charged yet.'
      : 'Leave at 2:00 PM is a request for both houses. Nothing is charged yet.';
  if (line.includes('$') || /door\s*code|wi-?fi|password/i.test(line)) return 'Nothing is charged yet.';
  return line;
}

/** The booking-page line for both houses. Nothing is sent. */
export function bothHouseFlexRhythm(flex: { early: boolean; late: boolean }): string {
  const line = `${bothHouseFlexLine('early', flex.early)} ${bothHouseFlexLine('late', flex.late)} Nothing is sent.`;
  if (line.includes('$') || /door\s*code|wi-?fi|password/i.test(line)) return 'Nothing is sent.';
  return line;
}

/** Add-ons the booking page can offer for these dates. An unknown calendar hides early and late. */
export function quoteOffers(input: {
  house: HouseId;
  checkIn: string;
  checkOut: string;
  asOf: string;
  taken: readonly string[];
  calendarLive: boolean;
  closed?: readonly string[];
  pace?: YearPace;
  guests?: number;
  children?: number;
}): UpsellOffer[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(input.checkOut)) return [];
  if (input.checkOut <= input.checkIn || input.asOf >= input.checkOut) return [];
  const quote = quoteStay(input.house, input.checkIn, input.checkOut, input.taken, {
    asOf: input.asOf,
    pace: input.pace ?? 'unknown',
    closed: input.closed ?? [],
    ...(input.guests !== undefined ? { guests: input.guests, ...(input.children !== undefined ? { children: input.children } : {}) } : {}),
  });
  if (!quote.ok) return [];
  const phase = input.asOf >= input.checkIn ? 'during' : 'before';
  return guestOffers({
    house: input.house,
    phase,
    nightBeforeFree: input.calendarLive ? nightBeforeIsFree(input.checkIn, input.taken, input.closed ?? []) : null,
    checkoutNightFree: input.calendarLive ? checkoutNightIsFree(input.checkOut, input.taken, input.closed ?? []) : null,
  });
}

/** A grocery list written with the drop. It is not saved and nothing is ordered. */
export function quoteGroceryLine(list: string, marked: boolean): string {
  if (!marked) return '';
  const saved = groceryListForSave(list);
  if (!saved) return 'A grocery list can be written here. It stays in this tab. Nothing is ordered or charged. This stay is not booked.';
  if (saved.includes('$') || /door\s*code|wi-?fi|password/i.test(saved)) {
    return 'That list stays off this paper. Nothing is ordered or charged. This stay is not booked.';
  }
  return `Grocery list: ${saved} This list stays in this tab. Nothing is ordered or charged. This stay is not booked.`;
}

/** A hot tub or grocery drop marked while the calendar is unread. No price. */
export function quoteCardAddonLine(names: readonly string[]): string {
  const clean = names.map((name) => name.trim()).filter((name) => name.length > 0);
  if (clean.length === 0) return '';
  const text = `${clean.join(' and ')} would be on the request. This stay is not booked. Nothing is charged yet. Nothing is sent.`;
  if (text.includes('$') || /door\s*code|wi-?fi|password/i.test(text)) return '';
  return text;
}

/** The booking page names an add-on without the door-code timing. The stay phone keeps its own detail. */
export function quoteOfferDetail(offer: { id: string; detail: string }): string {
  if (offer.id === 'early') return 'Arrive at 1:00 PM is a request. Nothing is charged yet.';
  const detail = offer.detail
    .replace(/The door code still opens the day before(?: check-in)?\. ?/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (/door\s*code|wi-?fi|password|\$/i.test(detail) || /\bis open\b/i.test(detail)) return '';
  return detail;
}

/** The line that would ride along with a request. Checking a box does not send it. */
export function quoteOfferNote(offers: readonly UpsellOffer[]): string {
  if (offers.length === 0) return '';
  return `Add-on request: ${offers.map((offer) => offer.name).join(', ')}. Nothing is charged yet.`;
}

/** A checked add-on stays beside the stay total. It is not folded into that total. */
export function quoteAddonApart(offers: readonly { name: string }[]): string {
  if (offers.length === 0) return '';
  const names = offers.map((offer) => offer.name).filter((name) => name.trim().length > 0);
  if (names.length === 0) return '';
  const verb = names.length === 1 ? 'is' : 'are';
  return `${names.join(', ')} ${verb} not in that total. Nothing is charged yet.`;
}

const HOST_SPOKEN: Record<UpsellId, string> = {
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

/** Ranch hot tub or River groceries before the stay starts. Lindon has neither. Nothing is charged. */
export function stayPrepPhrase(house: HouseId, checkIn: string, asOf: string, who: 'this' | 'next' = 'this'): string {
  if (house !== 'ranch' && house !== 'river') return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn) || asOf >= checkIn) return '';
  const item = house === 'ranch' ? 'the hot tub' : 'a grocery drop';
  const subject = who === 'next' ? 'The next stay' : 'This stay';
  return `${subject} can request ${item}. Nothing is charged yet.`;
}

/** What this stay can request. No price and no guest name. */
export function hostAddonPhrase(input: {
  house: HouseId;
  checkIn: string;
  checkOut: string;
  asOf: string;
  taken: readonly string[] | null;
}): string {
  if (!input.taken) return 'Checking the calendar for add-ons.';
  const offers = quoteOffers({
    house: input.house,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    asOf: input.asOf,
    taken: input.taken,
    calendarLive: true,
  });
  if (offers.length === 0) return 'No add-on for this stay.';
  return `Can request ${spokenList(offers.map((offer) => HOST_SPOKEN[offer.id]))}. This page does not send that request.`;
}

const STORAGE_KEY = 'uml-upsell-requests';

function readStore(): Record<string, UpsellId[]> {
  try {
    if (typeof sessionStorage === 'undefined') return {};
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Record<string, UpsellId[]>;
  } catch {
    return {};
  }
}

export function loadUpsellRequests(token: string): UpsellId[] {
  const list = readStore()[token];
  if (!Array.isArray(list)) return [];
  return list.filter((id): id is UpsellId => IDS.includes(id as UpsellId));
}

export function saveUpsellRequests(token: string, ids: readonly UpsellId[]) {
  try {
    if (typeof sessionStorage === 'undefined') return;
    const store = readStore();
    store[token] = [...ids];
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Private browsing can refuse storage. The request still shows until refresh.
  }
}

const LIST_KEY = 'uml-grocery-list';
const LIST_MAX = 400;

/** Keep a grocery list short. A blank list is dropped. */
export function groceryListForSave(value: string): string {
  const clipped = value.slice(0, LIST_MAX);
  return clipped.trim() ? clipped : '';
}

export function loadGroceryList(token: string): string {
  try {
    if (typeof sessionStorage === 'undefined' || !token) return '';
    const raw = sessionStorage.getItem(LIST_KEY);
    if (!raw) return '';
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return '';
    const list = (parsed as Record<string, unknown>)[token];
    return typeof list === 'string' ? groceryListForSave(list) : '';
  } catch {
    return '';
  }
}

export function saveGroceryList(token: string, value: string) {
  try {
    if (typeof sessionStorage === 'undefined' || !token) return;
    const raw = sessionStorage.getItem(LIST_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    const store: Record<string, string> = {};
    if (parsed && typeof parsed === 'object') {
      for (const [key, item] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof item === 'string' && item.trim()) store[key] = groceryListForSave(item);
      }
    }
    const next = groceryListForSave(value);
    if (next) store[token] = next;
    else delete store[token];
    sessionStorage.setItem(LIST_KEY, JSON.stringify(store));
  } catch {
    // The list still shows for this visit.
  }
}
