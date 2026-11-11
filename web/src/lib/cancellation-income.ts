/**
 * Money a cancellation still earned.
 *
 * A cancelled booking normally carries no income. The guest never stayed, so the `payout` on the row is what the
 * booking *would* have paid, and reading it as income would invent money that never arrived — the live book holds
 * twenty such rows, several with four-figure payouts, and none of that cash exists.
 *
 * But a channel sometimes keeps a cancellation fee under the host's own policy and pays it out anyway. That money is
 * real: it lands in the bank while the stay never happens. So it is recorded in its **own** field,
 * `cancellationIncome`, and never by writing a figure into `payout`. The separation is the whole safeguard — a row
 * earns on cancellation only when this field says so, so no existing cancelled row changes value.
 *
 * A cancellation fee is **income without a night**. It adds to revenue and to nothing else: no stay count, no stay
 * night, no occupied night, and no turnover cleaning — the cleaning fallback is `stays × the house fee`, so counting
 * a cancelled row as a stay would charge a clean for a house nobody slept in.
 *
 * The day it lands is the check-in month, the same rule every other payout already follows, and it is also the month
 * the fee was actually paid: Airbnb released this one on 2026-03-30 for a 2026-03-29 arrival.
 */

export type CancellationIncomeRow = {
  status?: string | null;
  cancellationIncome?: number | null;
};

/**
 * The fee a cancelled booking actually earned, in cents.
 *
 * Zero for everything that is not a cancelled row with a real, positive figure: a confirmed stay earns through
 * `payout`, and a negative, blank, or non-numeric value is not money. A blocked night never earns at all.
 */
export function cancellationIncomeOf(row: CancellationIncomeRow): number {
  if (row.status !== 'cancelled') return 0;
  const value = Number(row.cancellationIncome);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Whether a cancelled row still has money to post.
 *
 * This is the one reason to keep a cancelled stay in the book: everything that decides "is this a stay" still reads
 * `status`, so the row can carry its fee to the revenue line without becoming a booking anywhere else.
 */
export function earnsOnCancellation(row: CancellationIncomeRow): boolean {
  return cancellationIncomeOf(row) > 0;
}

/**
 * Whether a row belongs on a **revenue** line.
 *
 * Every revenue surface asks one of two questions — "what did this stay earn" and "what did this house earn" — and
 * this answers the first for the row list: an active stay, or a cancelled one that still earned a fee. A cancelled
 * row without a fee is not here, so no existing cancelled stay starts appearing anywhere.
 *
 * Deliberately not called `isActiveStay`: that predicate governs nights, turns, and stay counts, and a cancellation
 * fee has none of those. Using this in those places would put a guest who never arrived on the calendar.
 */
export function postsRevenue(row: CancellationIncomeRow & { status?: string | null }): boolean {
  if (row.status === 'blocked') return false;
  if (row.status === 'cancelled') return earnsOnCancellation(row);
  return true;
}

/** What a revenue row actually earned: its payout, or the fee when the stay was cancelled. */
export function revenueOf(row: CancellationIncomeRow & { payout?: number | null }): number {
  const fee = cancellationIncomeOf(row);
  if (fee > 0) return fee;
  const payout = Number(row.payout);
  return Number.isFinite(payout) ? payout : 0;
}
