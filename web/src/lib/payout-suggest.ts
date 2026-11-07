import { quoteStay } from './quote';
import { isRealDay } from './market/dates';
import type { QuotedSheetNight } from './market/rate-sheet';
import { SLEEPS } from './house-stay';
import type { HouseId } from './market/types';

/**
 * What to accept a request for.
 *
 * The inbox used to ask the host to type a payout with **no price on the screen at all**, so the
 * number was a guess. The guest was already quoted a figure on the booking page, and that figure is
 * what the host should see. This computes the same number from the same quote code the guest page
 * uses, including any host-approved night, so the two cannot drift apart.
 *
 * The payout is the host net, not the guest total: a direct stay has no platform fee, but the tax and
 * the cleaning are not part of what the host keeps either. That split already lives in the quote.
 */
export type SuggestedPayout = {
  house: HouseId;
  /** What the guest was quoted before tax, cleaning included. */
  guestTotal: number;
  /** Cleaning that is part of the guest total and is not host income on this line. */
  cleaning: number;
  /** What the host would record as the payout for this house. */
  hostNet: number;
  nights: number;
};

export type PayoutRequest = {
  propertyId?: string;
  alsoPropertyId?: string;
  checkIn?: string;
  checkOut?: string;
  guests?: number;
  children?: number;
};

function isHouse(value: unknown): value is HouseId {
  return value === 'river' || value === 'ranch' || value === 'lindon';
}

/**
 * Options for a payout suggestion.
 *
 * `sheet` is for a one-house request. `sheets` is per house, and a two-house request needs it: the
 * desk used to pass both houses' approved rows in one list, and `suggestedPayoutFor` matches a row
 * by date alone, so which house's approval won depended on the order the rows were stored in. The
 * same request produced three different prices for three orderings, and one of them put the Ranch's
 * approved rate onto the River House. Each house now reads only its own rows.
 */
export type PayoutOptions = {
  sheet?: readonly QuotedSheetNight[];
  sheets?: Partial<Record<HouseId, readonly QuotedSheetNight[]>>;
  pace?: 'short' | 'met' | 'unknown';
};

/** The rows that belong to one house: its own map entry, or the flat list for a one-house caller. */
function sheetForHouse(house: HouseId, options: PayoutOptions): readonly QuotedSheetNight[] {
  const own = options.sheets?.[house];
  if (own) return own;
  // A per-house map is authoritative: with one present, the flat list must not be used for a house
  // it does not describe, or the other house's prices leak in again.
  if (options.sheets) return [];
  return options.sheet ?? [];
}

/**
 * One house's payout. Null when the stay cannot be priced, because a made-up number is worse than a
 * blank the host has to fill in themselves.
 */
export function suggestedPayoutFor(
  house: HouseId,
  request: PayoutRequest,
  options: PayoutOptions = {},
): SuggestedPayout | null {
  const checkIn = typeof request.checkIn === 'string' ? request.checkIn : '';
  const checkOut = typeof request.checkOut === 'string' ? request.checkOut : '';
  if (!isRealDay(checkIn) || !isRealDay(checkOut) || checkOut <= checkIn) return null;

  const guests = typeof request.guests === 'number' && Number.isInteger(request.guests) ? request.guests : undefined;
  const children = typeof request.children === 'number' && Number.isInteger(request.children) ? request.children : undefined;

  const quote = quoteStay(house, checkIn, checkOut, [], {
    pace: options.pace ?? 'unknown',
    sheet: sheetForHouse(house, options),
    ...(guests !== undefined ? { guests } : {}),
    ...(children !== undefined ? { children } : {}),
  });
  if (!quote.ok || quote.lodging <= 0) return null;

  return {
    house,
    guestTotal: Math.round((quote.stayTotal + Number.EPSILON) * 100) / 100,
    cleaning: quote.cleaning,
    // Lodging is the direct (host-net) side of the quote. Cleaning is added to the guest total and is
    // not part of this payout line, so it stays out of the host net.
    hostNet: Math.round((quote.lodging + Number.EPSILON) * 100) / 100,
    nights: quote.nights.length,
  };
}

/**
 * The payout rows for a request. A two-house party gets one row per house, split from the same party
 * split the accept path uses, so the desk shows two numbers where two houses will be booked.
 */
export function suggestedPayouts(
  request: PayoutRequest,
  options: PayoutOptions = {},
): SuggestedPayout[] {
  const first = isHouse(request.propertyId) ? request.propertyId : null;
  if (!first) return [];
  const second = isHouse(request.alsoPropertyId) && request.alsoPropertyId !== first ? request.alsoPropertyId : null;
  if (!second) {
    const one = suggestedPayoutFor(first, request, options);
    return one ? [one] : [];
  }

  // Two houses: River takes its full capacity, the rest go to the other house, matching the accept.
  const guests = typeof request.guests === 'number' ? request.guests : 0;
  const children = typeof request.children === 'number' ? request.children : 0;
  const split = twoHouseParties(guests);
  if (!split) return [];

  const rows: SuggestedPayout[] = [];
  for (const [house, party] of split as Array<[Exclude<HouseId, 'lindon'>, number]>) {
    const one = suggestedPayoutFor(
      house,
      {
        ...request,
        propertyId: house,
        guests: party,
        ...(children > 0 && party > children ? { children } : {}),
      },
      options,
    );
    if (one) rows.push(one);
  }
  return rows;
}

/**
 * How a two-house party divides: the River House takes its full capacity, the rest go to the other
 * house. Null when the party cannot fill both, because accepting it as two houses would be wrong.
 *
 * Both the desk and the accept path read this, so the two figures cannot drift apart.
 */
export function twoHouseParties(
  guests: number,
  other: Exclude<HouseId, 'lindon'> = 'ranch',
): Array<[Exclude<HouseId, 'lindon'>, number]> | null {
  if (!Number.isInteger(guests) || guests < 2) return null;
  const riverGuests = SLEEPS.river;
  const otherGuests = guests - riverGuests;
  if (riverGuests < 1 || otherGuests < 1) return null;
  return [
    ['river', riverGuests],
    [other, otherGuests],
  ];
}

/**
 * One line for the desk. It names the figure to accept at, or says why there is none. It never
 * invents a number and never shows the guest-facing total as if it were the payout.
 */
export function suggestedPayoutLine(rows: readonly SuggestedPayout[]): string {
  if (rows.length === 0) {
    return 'This stay cannot be priced from the rate card, so type the payout yourself. Nothing is booked without it.';
  }
  if (rows.length === 1) {
    const row = rows[0]!;
    return `The guest was quoted ${money(row.guestTotal)} for ${row.nights === 1 ? '1 night' : `${row.nights} nights`}. The payout for this house is ${money(row.hostNet)}.`;
  }
  const total = rows.reduce((sum, row) => sum + row.hostNet, 0);
  return `Two houses: ${rows.map((row) => `${houseShort(row.house)} ${money(row.hostNet)}`).join(', ')}. Payout in total ${money(total)}.`;
}

function money(value: number): string {
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function houseShort(house: HouseId): string {
  return house === 'river' ? 'River' : house === 'ranch' ? 'Ranch' : 'Lindon';
}
