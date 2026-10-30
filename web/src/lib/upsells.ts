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
    detail: 'We shop in Orem and leave the bags in the kitchen. This is the drop fee. The groceries are extra, and the list goes to Nora.',
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
