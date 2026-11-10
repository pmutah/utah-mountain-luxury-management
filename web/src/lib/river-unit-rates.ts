import { RIVER_UNITS, isRiverUnitId, type RiverUnitId } from './river-units';

/**
 * What a Riverhouse unit is sold for. **Unset is a real state**, not zero.
 *
 * The three units exist as unpublished Airbnb drafts with no prices. Inventing a nightly rate and showing it to a
 * guest would be the exact failure this app has spent its life removing — a number with nothing behind it, on a
 * booking page, where a guest could pay it. So a unit carries `null` until the host sets it, and nothing guest-facing
 * may render a unit price that is null.
 */

export type UnitRate = {
  /** Guest nightly rate. Null until the host sets one. */
  nightly: number | null;
  /** Cleaning fee the guest pays. Null until set. */
  cleaning: number | null;
  /** Minimum nights. Null until set; the whole-house rules apply meanwhile. */
  minNights: number | null;
};

export type RiverUnitRates = Record<RiverUnitId, UnitRate>;

/** True when this unit has everything a guest-facing price needs. */
export type UnitRateState = 'unset' | 'partial' | 'ready';

export function blankUnitRates(): RiverUnitRates {
  return Object.fromEntries(
    RIVER_UNITS.map((id) => [id, { nightly: null, cleaning: null, minNights: null }]),
  ) as RiverUnitRates;
}

/**
 * The owner's published part prices, as given on 2026-11-10.
 *
 * These are the fallback when the store has nothing, so the three parts are sellable at exactly the figures the owner set
 * rather than sitting unset forever waiting for someone to type them in. A stored rate always wins: once the host saves a
 * price in the panel, that is what the app uses and this table is not consulted.
 *
 * Flat nightly for every occupancy, as instructed — no weekend uplift, no seasonal table, no extra-guest fee, no
 * smaller-group discount, no weekly or non-refundable discount, and no new-listing promo. Two-night minimum on each. The
 * whole-house season table and its $1,500 host-net floor apply **only** to the whole house; they must not be painted onto
 * the units.
 *
 * The nightlies add up to $1,545, which sits next to the whole-house weekday and below its weekend, so taking all three
 * parts is not a discount against the house. The three cleaning fees add up to the whole-house $600.
 */
export const PUBLISHED_UNIT_RATES: RiverUnitRates = {
  'garage-suite': { nightly: 265, cleaning: 120, minNights: 2 },
  'recreation-wing': { nightly: 535, cleaning: 180, minNights: 2 },
  'main-lodge': { nightly: 745, cleaning: 300, minNights: 2 },
};

function whole(value: unknown, min: number, max: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  return rounded >= min && rounded <= max ? rounded : null;
}

export function unitRateState(rate: UnitRate): UnitRateState {
  const set = [rate.nightly, rate.cleaning, rate.minNights].filter((value) => value !== null).length;
  if (set === 0) return 'unset';
  return rate.nightly !== null && rate.cleaning !== null && rate.minNights !== null ? 'ready' : 'partial';
}

/**
 * Read stored unit rates back, refusing anything that is not a real rate.
 *
 * A stored nightly of 0, or a negative, is not a rate: it would let a guest book a free night. It reads as null, so
 * the unit is treated as unset rather than silently free — the same rule `toApprovedRate` applies to the rate sheet.
 */
export function toUnitRates(value: unknown): RiverUnitRates {
  const out = blankUnitRates();
  if (!value || typeof value !== 'object') return out;
  const raw = value as Record<string, unknown>;
  for (const id of RIVER_UNITS) {
    const entry = raw[id];
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    out[id] = {
      nightly: whole(row.nightly, 1, 100_000),
      cleaning: whole(row.cleaning, 0, 10_000),
      minNights: whole(row.minNights, 1, 365),
    };
  }
  return out;
}

/**
 * The one sentence a host reads about a unit's price.
 *
 * A unit with no rate is not "free"; it is not sellable, and it says so with what is missing.
 */
export function unitRateLine(rate: UnitRate): string {
  const state = unitRateState(rate);
  if (state === 'ready') {
    return `$${rate.nightly} a night, $${rate.cleaning} cleaning, ${rate.minNights}-night minimum.`;
  }
  const missing = [
    rate.nightly === null ? 'a nightly rate' : '',
    rate.cleaning === null ? 'a cleaning fee' : '',
    rate.minNights === null ? 'a minimum stay' : '',
  ].filter(Boolean);
  return `Not sellable yet: needs ${missing.join(', ')}. Nothing is shown to a guest until it has all three.`;
}

/** Only units with a complete rate may be offered or priced. */
export function sellableUnits(rates: RiverUnitRates): RiverUnitId[] {
  return RIVER_UNITS.filter((id) => unitRateState(rates[id]) === 'ready');
}

/** A guest-facing nightly price, or null. Never 0, never a guess. */
export function unitNightlyOrNull(rates: RiverUnitRates, id: string): number | null {
  if (!isRiverUnitId(id)) return null;
  const rate = rates[id];
  return unitRateState(rate) === 'ready' ? rate.nightly : null;
}
