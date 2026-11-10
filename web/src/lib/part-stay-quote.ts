import { RIVER_UNIT_DETAIL } from './river-units';
import { sellableUnits, type RiverUnitRates } from './river-unit-rates';

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

  const lodging = scoped.reduce((sum, detail) => sum + (rates[detail.id].nightly ?? 0) * nights, 0);
  const cleaning = scoped.reduce((sum, detail) => sum + (rates[detail.id].cleaning ?? 0), 0);
  return {
    nights,
    lodging: Math.round(lodging * 100) / 100,
    cleaning: Math.round(cleaning * 100) / 100,
    total: Math.round((lodging + cleaning) * 100) / 100,
    parts: scoped.map((detail) => detail.name),
  };
}
