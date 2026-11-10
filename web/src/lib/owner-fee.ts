/**
 * The management fee, in one place.
 *
 * The ranch and river each pay Brandon a management fee before the remainder is split 50/50 with Todd. That rate is a fixed
 * business fact (20%, charged on rent **after cleaning**) and it appears in eight places:
 *
 *   - `report.ts` computes the money with `basis * 0.2`
 *   - `OwnerStatement.tsx`, `OwnerPortal.tsx`, `PropertyDetail.tsx`, `PortfolioReport.tsx` (three times), `MoneyWaterfall.tsx`
 *     and `OwnerDistribution.tsx` each say "20%" in prose
 *
 * Nothing linked them, and this session has already produced a defect from exactly that shape: the "Half is" sentence lived in
 * two components, one was fixed, and the owner's page kept telling them to halve a number and get a different answer for a turn.
 * A rate repeated eight times is the same hazard with a longer fuse — change the fee for one property, or correct the basis, and
 * the prose keeps saying 20% while the arithmetic says something else.
 *
 * So the number and the words come from here. The components still write their own sentences, but the figure in them is
 * interpolated, and a guard fails by name if a new literal "20%" appears in a money-facing string.
 */

/** The share of rent (after cleaning) taken as a management fee, before the remainder is split. */
export const MANAGEMENT_FEE_RATE = 0.2;

/** The rate as a whole percent, for prose: `20`. */
export const MANAGEMENT_FEE_PERCENT = Math.round(MANAGEMENT_FEE_RATE * 100);

/** "20%", so a sentence cannot disagree with the number. */
export const MANAGEMENT_FEE_LABEL = `${MANAGEMENT_FEE_PERCENT}%`;

/** The houses the fee and the split apply to. Lindon is Brandon's alone and takes no fee. */
export const SPLIT_HOUSES = ['ranch', 'river'] as const;

/**
 * The fee for a house's rent, in whole cents.
 *
 * Charged on rent **after cleaning** — the owner's rule — and never on a negative basis: a month that lost money is not charged
 * a management fee on the loss, because that would grow the loss and invert the incentive the fee is meant to represent.
 */
export function managementFee(rentAfterCleaning: number): number {
  if (!Number.isFinite(rentAfterCleaning) || rentAfterCleaning <= 0) return 0;
  return Math.round((rentAfterCleaning * MANAGEMENT_FEE_RATE + Number.EPSILON) * 100) / 100;
}

/** What is left to split after the fee, in whole cents. */
export function afterFee(rentAfterCleaning: number): number {
  return Math.round((rentAfterCleaning - managementFee(rentAfterCleaning) + Number.EPSILON) * 100) / 100;
}
