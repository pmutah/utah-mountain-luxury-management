import { addDays } from './market/dates';
import type { HouseId } from './market/types';
import { RIVER_UNIT_DETAIL } from './river-units';
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
  /**
   * Which parts of the Riverhouse this request takes. Absent means the whole house, so a request made before parts
   * existed accepts exactly as it did.
   */
  units?: readonly string[];
  /**
   * Parts another party already holds on these nights.
   *
   * The route computes this from the real calendar and hands it in, so the acceptance line can tell the host that two
   * guests will share the building and its single door code. Parts only; never a guest.
   */
  sharedWith?: readonly string[];
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
  /**
   * Which parts of the Riverhouse this stay occupies.
   *
   * Absent means the whole house. Only a single-house Riverhouse booking can carry parts.
   */
  units?: string[];
  /**
   * Parts of the house occupied by **someone else** on these nights.
   *
   * The building has one door code, so a part booking alongside another party means both hold a code that opens
   * every part. The host decides whether that is acceptable (fit separate locks, or do not sell parts on the same
   * nights), but they have to know it at the moment they accept — not discover it when a guest arrives.
   *
   * Named parts only, never a guest. Absent means nobody else is in the house.
   */
  sharedWith?: string[];
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
   * rather than in half, because a party of 30 puts 24 in one house and 6 in the other.
   *
   * These are lodging figures, not guest totals: cleaning differs per house and is not part of the
   * payout, so weighting by the guest total put money on the wrong house.
   */
  shares?: Partial<Record<HouseId, number>>;
  /**
   * Which parts of the Riverhouse this booking occupies.
   *
   * Absent means the whole house. Carried on the plan so the host's confirmation says which part was sold instead of
   * telling them the whole house is now booked when only the Main Lodge is.
   */
  units?: string[];
  /**
   * Parts another party holds on these nights, so the host's confirmation can warn that two guests will share the
   * building and its single door code. Named parts only, never a guest.
   */
  sharedWith?: string[];
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
      /*
       * The parts travel on the stay itself, because the blocking rules read them from the saved reservation. Only a
       * single-house Riverhouse plan can carry parts; a two-house party is the whole of both houses.
       */
      ...(houses.length === 1 && house === 'river' && (plan.units ?? []).length > 0
        ? { units: [...(plan.units ?? [])] }
        : {}),
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
      /*
       * The parts this booking occupies, kept from the caller. Only names we actually sell survive, and only for the
       * Riverhouse: a stray unit on a Ranch request would be a booking for a part that does not exist. An empty list is
       * omitted entirely, because absent is what "the whole house" means everywhere else.
       */
      ...(propertyId === 'river' && !also && (input.plan.units ?? []).some((unit) => RIVER_UNIT_DETAIL.some((detail) => detail.id === unit))
        ? {
            units: (input.plan.units ?? [])
              .filter((unit) => RIVER_UNIT_DETAIL.some((detail) => detail.id === unit))
              .slice(0, RIVER_UNIT_DETAIL.length),
          }
        : {}),
      /*
       * Parts another party holds on these nights, carried through so `acceptedLine` can warn the host. Only for a
       * part booking at the Riverhouse, and only names of parts — a whole-house booking occupies every part, so there
       * is nobody else to warn about.
       */
      ...(propertyId === 'river' && !also && (input.plan.sharedWith ?? []).length > 0
        ? { sharedWith: [...(input.plan.sharedWith ?? [])] }
        : {}),
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
  /*
   * A part booking is not the whole house. Saying "The River House is booked" when only the Main Lodge was sold would
   * tell a host the entire house is gone and the other two parts are unsellable — the opposite of the rule.
   */
  const parts = (plan.units ?? []).filter((unit) => typeof unit === 'string' && unit.length > 0);
  const partName = (unit: string) =>
    RIVER_UNIT_DETAIL.find((detail) => detail.id === unit)?.name ?? unit;
  const houses = plan.alsoPropertyId
    ? `${plan.propertyId === 'river' ? 'The River House' : plan.propertyId === 'ranch' ? 'The Ranch House' : 'The Lindon House'} and the second house`
    : parts.length > 0 && plan.propertyId === 'river'
      ? `${parts.map(partName).join(' and ')} at the River House`
      : plan.propertyId === 'river'
        ? 'The River House'
        : plan.propertyId === 'ranch'
          ? 'The Ranch House'
          : 'The Lindon House';
  const nights = plan.nights === 1 ? '1 night' : `${plan.nights} nights`;
  const line = `${houses} is booked for ${nights}. The host payout is saved. Nothing was sent to the guest from here.`;
  if (line.includes('$')) return 'The stay is saved. Nothing was sent to the guest from here.';

  /*
   * A part booking can put two parties in one building, and the building has a single door code. The host decides
   * whether that is acceptable, but they have to see it when they accept the stay — the pricing panel says it before a
   * price invites it, and this says it at the other moment the decision is actually made.
   *
   * The other party is named by part, never by guest: that is all the host needs, and a name would put one guest's
   * stay into another guest's record.
   */
  const shared = (plan.sharedWith ?? []).filter((unit) => typeof unit === 'string' && unit.length > 0);
  if (shared.length === 0) return line;
  const sharedNames = shared.map(partName).join(' and ');
  /*
   * Plain prose, not markdown: this string is rendered straight into a JSX paragraph, so `**bold**` would reach the
   * host as literal asterisks. The emphasis belongs on a separate field the surface can style.
   */
  return (
    `${line} ${sharedNames} ${shared.length === 1 ? 'is' : 'are'} occupied by another party on those nights, ` +
    'so two guests share the building and the one door code opens every part. Give each part its own lock, or do not sell parts on the same nights.'
  );
}

/**
 * The shared-house warning on its own, so a surface can style it as a warning instead of burying it in a sentence.
 *
 * Null when nobody else is in the house, which is the common case — a caller can render this unconditionally.
 */
export function sharedHouseWarning(plan: AcceptPlan): string | null {
  const shared = (plan.sharedWith ?? []).filter((unit) => typeof unit === 'string' && unit.length > 0);
  if (shared.length === 0) return null;
  const partName = (unit: string) => RIVER_UNIT_DETAIL.find((detail) => detail.id === unit)?.name ?? unit;
  const names = shared.map(partName).join(' and ');
  return (
    `${names} ${shared.length === 1 ? 'is' : 'are'} occupied by another party on those nights, so two guests ` +
    'share the building and the one door code opens every part.'
  );
}

/**
 * The host's line when the guest's quote and a fresh quote disagree.
 *
 * The booking is recorded at the guest's figure — that is what they agreed to. This says so, and says what today's card
 * would produce, so a host is not surprised by an invoice that does not match the pricing panel.
 *
 * Silent when the request carried no quote (every request made before the field existed) and when the two agree.
 */
export function quotedTotalNote(quoted: number | undefined, fresh: number | null): string | null {
  if (typeof quoted !== 'number' || !Number.isFinite(quoted) || quoted <= 0) return null;
  if (fresh === null || !Number.isFinite(fresh) || fresh <= 0) return null;
  if (Math.abs(quoted - fresh) < 0.005) return null;

  const money = (n: number) =>
    `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const higher = quoted > fresh;
  return (
    `The guest was quoted ${money(quoted)}, which is what this booking is recorded at. ` +
    `Today's rate card would quote ${money(fresh)}, ${money(Math.abs(quoted - fresh))} ${higher ? 'less' : 'more'}. ` +
    `${higher ? 'A promotion may have ended since they asked' : 'A rate may have risen since they asked'} — check before you invoice.`
  );
}
