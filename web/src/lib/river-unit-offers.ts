import type { PublicUnit } from './booked-nights';
import type { HouseId } from './market/types';
import { partsSleeps } from './party-fits-parts';
import { partCost } from './part-stay-quote';
import { RIVER_UNIT_DETAIL, type RiverUnitId } from './river-units';

/**
 * What the booking page says about the Riverhouse parts.
 *
 * The guest question this answers is specific: *the house is taken for my dates — is any part of it still free?* The
 * answer must never be a number the host did not set, and never a part the booking gate would refuse. So the offer is
 * built only from parts that are priced (`nightly` is a real figure) *and* whose every requested night is in the parts'
 * own free-night list.
 *
 * Nothing here books. It decides what to show, and every offer it produces goes back through `unitRequestCheck` when
 * the guest submits.
 */

export type UnitStayOffer = {
  unit: PublicUnit;
  /** Lodging for the nights asked, at the part's nightly rate. Null when no dates are chosen yet. */
  lodging: number | null;
  /** Cleaning the guest pays, when the part has one. */
  cleaning: number | null;
  /** Lodging plus cleaning, before tax. Null when no dates are chosen. */
  total: number | null;
  /** Nights asked for that this part does not have free. Empty when it is free for the whole stay. */
  blocked: string[];
  /** True only when the part is priced and every night asked for is free. */
  available: boolean;
  /** Why it cannot be booked, or null when it can. */
  reason: string | null;
};

function nights(from: string, to: string): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to <= from) return [];
  const out: string[] = [];
  let cursor = from;
  for (let guard = 0; guard < 400 && cursor < to; guard += 1) {
    out.push(cursor);
    const [y, m, d] = cursor.split('-').map(Number);
    const date = new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1));
    date.setUTCDate(date.getUTCDate() + 1);
    cursor = date.toISOString().slice(0, 10);
  }
  return out;
}

/**
 * The parts, priced and matched against the dates the guest picked.
 *
 * A part with no price is returned with `available: false` and a reason that says so, rather than being filtered out.
 * A guest who is told nothing about a part assumes the house is one undivided unit; a guest told "not priced yet" knows
 * to ask. That is the honest answer and it is what the host's own panel says.
 */
export function unitStayOffers(
  units: readonly PublicUnit[] | null,
  checkIn: string,
  checkOut: string,
): UnitStayOffer[] {
  if (!units) return [];
  const wanted = nights(checkIn, checkOut);
  return units.map((unit) => {
    /*
     * A part is bookable only when the route says it is. `rateState` is the route's own answer, and a `partial` part is
     * missing something the guest needs — a cleaning fee or a minimum stay — so it must not be offered even though its
     * nightly looks fine. Trusting `nightly` alone is how a page offers a stay it cannot quote.
     */
    const priced = unit.rateState === 'ready' && unit.nightly !== null && unit.nightly > 0;
    if (!priced) {
      return {
        unit,
        lodging: null,
        cleaning: null,
        total: null,
        blocked: [],
        available: false,
        reason:
          unit.rateState === 'partial'
            ? 'This part is not fully priced yet, so it cannot be booked.'
            : 'This part has no price yet, so it cannot be booked.',
      };
    }
    if (wanted.length === 0) {
      // No dates yet: the part is priced, but nothing is claimed about availability.
      return { unit, lodging: null, cleaning: null, total: null, blocked: [], available: false, reason: null };
    }
    const free = new Set(unit.nights);
    const blocked = wanted.filter((night) => !free.has(night));
    /*
     * The figure comes from `partCost`, the same function the accept route uses to record the reservation. They were
     * computed separately once: the page showed $790 for a two-night Garage Suite stay while the booking recorded $4,500,
     * the whole house. One formula, two callers.
     */
    const cost = partCost(
      [{ nightly: unit.nightly, cleaning: unit.cleaning, ready: unit.rateState === 'ready' }],
      wanted.length,
    );
    const lodging = cost?.lodging ?? null;
    const cleaning = cost?.cleaning ?? null;
    if (blocked.length > 0) {
      return {
        unit,
        lodging,
        cleaning,
        total: cost?.total ?? null,
        blocked,
        available: false,
        reason:
          blocked.length === wanted.length
            ? 'This part is booked for all of those nights.'
            : `This part is booked on ${blocked[0]}.`,
      };
    }
    // A minimum stay shorter than the request is fine; longer is not.
    if (unit.minNights !== null && unit.minNights > wanted.length) {
      return {
        unit,
        lodging,
        cleaning,
        total: cost?.total ?? null,
        blocked: [],
        available: false,
        reason: `This part has a ${unit.minNights}-night minimum.`,
      };
    }
    return {
      unit,
      lodging,
      cleaning,
      total: cost?.total ?? null,
      blocked: [],
      available: true,
      reason: null,
    };
  });
}

/** A list the way a person writes it: "A", "A and B", "A, B, and C". */
function nameList(names: readonly string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

/**
 * The one line a guest reads above the parts.
 *
 * It must not claim the house is free when it is not, and it must not imply a part is available when the only parts on
 * screen are priced-out. `houseFree` comes from the house calendar the page already has.
 */
export function unitOfferLine(
  offers: readonly UnitStayOffer[],
  house: HouseId,
  houseFree: boolean,
  hasDates: boolean,
): string | null {
  // The parts only exist at the Riverhouse, so any other house says nothing about them.
  if (house !== 'river') return null;
  if (offers.length === 0) return null;
  const priced = offers.filter((offer) => offer.unit.rateState === 'ready' && offer.unit.nightly !== null);
  const open = offers.filter((offer) => offer.available);
  if (!hasDates) {
    if (priced.length === 0) return 'The River House can also be rented in parts, but none of them has a price yet.';
    return 'The River House can also be rented in parts. Choose your dates to see which ones are open.';
  }
  if (open.length > 0) {
    const names = nameList(open.map((offer) => offer.unit.name.replace('River ', '')));
    const line =
      open.length === 1
        ? `The full house is not open for these dates, but the ${names} is.`
        : `The full house is not open for these dates, but the ${names} are.`;
    // When the house *is* free, saying it is not would be a lie. The parts are simply an alternative.
    return houseFree ? `You can also book just part of the house: the ${names}.` : line;
  }
  if (priced.length === 0) return 'The River House can also be rented in parts, but none of them has a price yet.';
  return 'No part of the River House is open for those dates.';
}

/**
 * What a guest choosing a part is giving up.
 *
 * The portal told a part guest that other guests may be in the house — but only **after** they had booked and paid. The
 * booking page, where the choice is actually made, said nothing, so a guest could reasonably read "the Garage Suite" as
 * "a private house with fewer bedrooms" and discover the truth on arrival.
 *
 * Null when no part is chosen or when the guest has taken every part, because then there is nothing to give up.
 */
export function partSharedHouseLine(offers: readonly UnitStayOffer[]): string | null {
  const chosen = offers.filter((offer) => offer.available || offer.total !== null);
  if (chosen.length === 0) return null;
  if (chosen.length >= RIVER_UNIT_DETAIL.length) return null;
  return 'This is part of a shared house. The other parts, and the shared spaces, may be used by other guests during your stay.';
}

/**
 * The add-on total for several parts booked together.
 *
 * Two parts are one reservation, so the guest sees one combined figure rather than two separate stays. A part with no
 * price contributes nothing and makes the total null, because a partial sum would understate what the stay costs.
 */
export function unitsTogetherTotal(offers: readonly UnitStayOffer[]): number | null {
  if (offers.length === 0) return null;
  let total = 0;
  for (const offer of offers) {
    if (offer.total === null) return null;
    total += offer.total;
  }
  return total;
}

/**
 * The largest party the chosen parts can hold.
 *
 * Reads the shared cap rather than summing raw capacities here: the parts add up to more than the house sleeps, and the
 * card used to print that inflated figure beside a form that refused it. One number, one place.
 */
export function unitsTogetherSleeps(offers: readonly UnitStayOffer[]): number {
  return partsSleeps(offers.map((offer) => offer.unit.id as RiverUnitId));
}
