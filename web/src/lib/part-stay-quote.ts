import { RIVER_UNIT_DETAIL } from './river-units';
import { sellableUnits, type RiverUnitRates } from './river-unit-rates';

/**
 * The arithmetic for a stay in part of the Riverhouse: the one place it lives.
 *
 * The booking page shows this figure and the accept route records it on the reservation, which feeds the owner statements.
 * They were computed from different inputs once and disagreed: the page showed $790 for two nights in the Garage Suite
 * while the booking recorded $4,500 — the whole house — because the route quoted the house regardless of what was asked
 * for. Both call this now, so a guest's price and the recorded price cannot drift apart.
 *
 * Returns null when any part has no complete price. A partial figure understates what the guest owes, and a missing total
 * is visible where a wrong one is not.
 */
export type PartCost = { lodging: number; cleaning: number; total: number };

export function partCost(
  parts: ReadonlyArray<{ nightly: number | null; cleaning: number | null; ready: boolean }>,
  nights: number,
): PartCost | null {
  if (!Number.isInteger(nights) || nights < 1) return null;
  if (parts.length === 0) return null;
  let lodging = 0;
  let cleaning = 0;
  for (const part of parts) {
    if (!part.ready || part.nightly === null || part.cleaning === null) return null;
    lodging += part.nightly * nights;
    cleaning += part.cleaning;
  }
  const cents = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  return { lodging: cents(lodging), cleaning: cents(cleaning), total: cents(lodging + cleaning) };
}

/**
 * What a guest pays for a stay in **part** of the Riverhouse.
 *
 * A part booking was recorded with the whole-house figure: `quoteStay` prices the house, and the accept route called it
 * regardless of what the guest had asked for. A two-night Garage Suite stay costing $790 was saved with
 * `guestTotal: 4500` — the house — and that number feeds the owner statements and any invoice built from the booking.
 *
 * So a part is priced from its own rate: nightly × nights, plus the cleaning fee, summed over the parts taken. It returns
 * null when any part has no complete price, because a partial figure is worse than none — the caller then records no guest
 * total rather than a wrong one.
 */
export type PartQuote = {
  /** Nights charged, so the caller can sanity-check the split. */
  nights: number;
  lodging: number;
  cleaning: number;
  /** What the guest pays before tax. */
  total: number;
  /** The parts priced into this figure, for a line the host can read. */
  parts: string[];
};

/**
 * Price a stay in the given parts, or null when any of them cannot be priced.
 *
 * `units` is the raw list off the saved request, so an unknown name is dropped rather than priced at zero.
 */
export function partStayQuote(
  units: readonly string[],
  nights: number,
  rates: RiverUnitRates,
): PartQuote | null {
  if (!Number.isInteger(nights) || nights < 1) return null;
  const priced = new Set(sellableUnits(rates));
  const scoped = RIVER_UNIT_DETAIL.filter((detail) => units.includes(detail.id) && priced.has(detail.id));
  /*
   * Every named part has to be priced. A request naming one priced part and one unpriced one would otherwise be quoted
   * for the cheaper half, which understates what the guest owes — the same class of error as the overstatement this
   * replaces, in the other direction.
   */
  const named = RIVER_UNIT_DETAIL.filter((detail) => units.includes(detail.id));
  if (scoped.length === 0 || scoped.length !== named.length) return null;

  // The same arithmetic the booking page shows, so the guest's price and the recorded price cannot disagree.
  const cost = partCost(
    scoped.map((detail) => ({
      nightly: rates[detail.id].nightly,
      cleaning: rates[detail.id].cleaning,
      ready: priced.has(detail.id),
    })),
    nights,
  );
  if (!cost) return null;
  return {
    nights,
    lodging: cost.lodging,
    cleaning: cost.cleaning,
    total: cost.total,
    parts: scoped.map((detail) => detail.name),
  };
}
