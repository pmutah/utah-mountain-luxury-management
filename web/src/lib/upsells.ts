import { checkoutNightIsFree, nightBeforeIsFree } from './journey';
import type { HouseId } from './market/types';

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

/** Add-ons the booking page can offer for these dates. An unknown calendar hides early and late. */
export function quoteOffers(input: {
  house: HouseId;
  checkIn: string;
  checkOut: string;
  asOf: string;
  taken: readonly string[];
  calendarLive: boolean;
}): UpsellOffer[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(input.checkOut)) return [];
  if (input.checkOut <= input.checkIn || input.asOf >= input.checkOut) return [];
  const phase = input.asOf >= input.checkIn ? 'during' : 'before';
  return guestOffers({
    house: input.house,
    phase,
    nightBeforeFree: input.calendarLive ? nightBeforeIsFree(input.checkIn, input.taken) : null,
    checkoutNightFree: input.calendarLive ? checkoutNightIsFree(input.checkOut, input.taken) : null,
  });
}

/** The line that would ride along with a request. Checking a box does not send it. */
export function quoteOfferNote(offers: readonly UpsellOffer[]): string {
  if (offers.length === 0) return '';
  return `Add-on request: ${offers.map((offer) => offer.name).join(', ')}. Nothing is charged yet.`;
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
