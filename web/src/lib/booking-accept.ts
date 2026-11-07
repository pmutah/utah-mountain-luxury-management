import { addDays } from './market/dates';
import type { HouseId } from './market/types';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export type AcceptableRequest = {
  id: string;
  propertyId?: string;
  alsoPropertyId?: string;
  checkIn?: string;
  checkOut?: string;
  guests?: number;
  children?: number;
  returning?: boolean;
};

export type AcceptInput = {
  /** Host night-by-night dollars. Zero is allowed when the host is comping the stay. */
  payout: number;
  source?: string;
  /** A saved stay with these nights already on that house, other than this request. */
  takenOnHouse?: readonly string[];
};

/** One stay to save. A two-house request produces two of these. */
export type StayPlan = {
  propertyId: HouseId;
  checkIn: string;
  checkOut: string;
  nights: number;
  guestName: string;
  note: string;
  payout: number;
  source: string;
  /**
   * What the guest was quoted for this house, before tax, when the quote knew it.
   *
   * Only the host net was stored, so once a request was accepted nothing recorded the price the guest
   * had agreed to: the request row carries no price and the booking carried only `payout`. That made
   * the booking impossible to invoice from, and left no way to check a payment against what was
   * promised. It is kept per house for the same reason the payout is — a two-house party is quoted
   * two figures, and only their sum belongs to the guest.
   */
  guestTotal?: number;
};

export type AcceptPlan = {
  propertyId: HouseId;
  alsoPropertyId?: HouseId;
  checkIn: string;
  checkOut: string;
  nights: number;
  guestName: string;
  note: string;
  payout: number;
  source: string;
  /** What the guest was quoted in total, before tax, when the quote knew it. */
  guestTotal?: number;
  /** The guest total for each house, so it can be recorded per stay like the payout. */
  guestShares?: Partial<Record<HouseId, number>>;
  /**
   * The host net for each house, when the quote knows it. The payout is split in that proportion
   * rather than in half, because a party of 30 puts 25 in one house and 5 in the other.
   *
   * These are lodging figures, not guest totals: cleaning differs per house and is not part of the
   * payout, so weighting by the guest total put money on the wrong house.
   */
  shares?: Partial<Record<HouseId, number>>;
};

/**
 * The stays an accepted request becomes, one per house. The host net is split across the houses so a
 * statement for a single house does not show a stay with revenue and no money, or money and no stay.
 * The cents land on the first stay so the two still add up to the request total.
 */
export function stayPlans(plan: AcceptPlan): StayPlan[] {
  const houses: HouseId[] = plan.alsoPropertyId ? [plan.propertyId, plan.alsoPropertyId] : [plan.propertyId];
  const cents = Math.round(plan.payout * 100);
  const weight = (house: HouseId): number => {
    const value = plan.shares?.[house];
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
  };
  const weights = houses.map(weight);
  // The proportional split is only used when every house has a usable weight. A partial map would
  // give one house the whole net and leave the other with a stay and no revenue, which is the exact
  // problem this split exists to avoid.
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  const proportional = weights.every((value) => value > 0) && totalWeight > 0;
  const portions = proportional
    ? houses.map((_, index) => Math.floor((cents * weights[index]!) / totalWeight))
    : houses.map(() => Math.floor(cents / houses.length));
  // Any rounding leftover goes on the first house, so the two always add up exactly.
  const assigned = portions.reduce((sum, value) => sum + value, 0);
  const shares = houses.map((_, index) => (index === 0 ? portions[0]! + (cents - assigned) : portions[index]!));
  return houses.map((house, index) => {
    /*
     * The guest total follows the same proportional split as the payout, in cents, with the leftover
     * on the first house so two stays always add up to the figure the guest was quoted. A house with
     * no guest figure records none rather than inventing half of one.
     *
     * A one-house plan carries `guestTotal` rather than `guestShares`, so it is used directly — the
     * first version only read `guestShares` and silently dropped the figure for every single-house
     * booking.
     */
    const guestShare = plan.guestShares?.[house];
    const guestCents =
      typeof guestShare === 'number' && Number.isFinite(guestShare) && guestShare > 0
        ? Math.round(guestShare * 100)
        : houses.length === 1 && typeof plan.guestTotal === 'number' && Number.isFinite(plan.guestTotal) && plan.guestTotal > 0
          ? Math.round(plan.guestTotal * 100)
          : null;
    return {
      propertyId: house,
      checkIn: plan.checkIn,
      checkOut: plan.checkOut,
      nights: plan.nights,
      guestName: plan.guestName,
      note: index === 0 ? plan.note : `${plan.note} Second house on the same request.`,
      payout: (shares[index] ?? 0) / 100,
      source: plan.source,
      ...(guestCents !== null ? { guestTotal: guestCents / 100 } : {}),
    };
  });
}

function isHouse(id: string | undefined): id is HouseId {
  return id === 'river' || id === 'ranch' || id === 'lindon';
}

/**
 * What accepting a request would save. It refuses a request that was already accepted once, a
 * night now taken, a bad party, or a payout that is not a real number. Nothing is written here.
 */
export function acceptHold(input: {
  request: AcceptableRequest;
  alreadyAccepted: boolean;
  plan: AcceptInput;
  asOf: string;
}): { ok: true; plan: AcceptPlan } | { ok: false; reason: string } {
  const { request } = input;
  if (input.alreadyAccepted) {
    return { ok: false, reason: 'This request is already a booking. A second accept would double the stay.' };
  }
  const propertyId = request.propertyId ?? '';
  if (!isHouse(propertyId)) return { ok: false, reason: 'This request does not name a house we rent.' };
  const also = request.alsoPropertyId ?? '';
  if (also && (!isHouse(also) || also === propertyId)) {
    return { ok: false, reason: 'A second house has to be one of the three rented houses and not the first.' };
  }
  const checkIn = request.checkIn ?? '';
  const checkOut = request.checkOut ?? '';
  if (!DATE.test(checkIn) || !DATE.test(checkOut) || checkOut <= checkIn) {
    return { ok: false, reason: 'This request does not name a stay we can save.' };
  }
  if (DATE.test(input.asOf) && checkIn < input.asOf) {
    return { ok: false, reason: 'That check-in has already passed. Accepting it would save a stay in the past.' };
  }
  const guests = request.guests;
  if (guests !== undefined) {
    if (!Number.isInteger(guests) || guests < 1) return { ok: false, reason: 'The party size on this request is not a whole number of guests.' };
    const children = request.children;
    if (children !== undefined && (!Number.isInteger(children) || children < 0 || children >= guests)) {
      return { ok: false, reason: 'The children on this request do not fit inside the party. A stay needs an adult.' };
    }
  }
  if (!Number.isFinite(input.plan.payout) || input.plan.payout < 0) {
    return { ok: false, reason: 'A host payout has to be zero or more.' };
  }
  // A night that is now on the calendar means the host is committing to a double booking.
  const clash = input.plan.takenOnHouse ?? [];
  if (clash.length > 0) {
    return {
      ok: false,
      reason: 'Those nights are already on the calendar at that house. Accepting this would double-book the stay.',
    };
  }
  const nights = nightsBetween(checkIn, checkOut);
  if (nights < 1) return { ok: false, reason: 'This request does not name a stay we can save.' };

  const party =
    guests === undefined
      ? ''
      : request.children !== undefined && request.children > 0
        ? `${guests} guests including ${request.children === 1 ? '1 child' : `${request.children} children`}`
        : `${guests} guests`;
  const note = [
    request.returning ? 'Returning guest.' : '',
    party,
    `Direct request ${request.id}.`,
  ]
    .filter(Boolean)
    .join(' · ');

  return {
    ok: true,
    plan: {
      propertyId,
      ...(also && isHouse(also) ? { alsoPropertyId: also } : {}),
      checkIn,
      checkOut,
      nights,
      guestName: 'Direct guest',
      note,
      payout: Math.round(input.plan.payout * 100) / 100,
      source: (input.plan.source ?? 'Direct').slice(0, 40) || 'Direct',
    },
  };
}

/** Nights between two days. A checkout morning is not a night. */
export function nightsBetween(checkIn: string, checkOut: string): number {
  if (!DATE.test(checkIn) || !DATE.test(checkOut) || checkOut <= checkIn) return 0;
  let nights = 0;
  let cursor = checkIn;
  for (let guard = 0; guard < 400 && cursor < checkOut; guard += 1) {
    nights += 1;
    cursor = addDays(cursor, 1);
  }
  return nights;
}

/** A confirmation line for the host. No guest name, no door code, and it does not quote a rate. */
export function acceptedLine(plan: AcceptPlan): string {
  const houses = plan.alsoPropertyId
    ? `${plan.propertyId === 'river' ? 'The River House' : plan.propertyId === 'ranch' ? 'The Ranch House' : 'The Lindon House'} and the second house`
    : plan.propertyId === 'river'
      ? 'The River House'
      : plan.propertyId === 'ranch'
        ? 'The Ranch House'
        : 'The Lindon House';
  const nights = plan.nights === 1 ? '1 night' : `${plan.nights} nights`;
  const line = `${houses} is booked for ${nights}. The host payout is saved. Nothing was sent to the guest from here.`;
  return line.includes('$') ? 'The stay is saved. Nothing was sent to the guest from here.' : line;
}
