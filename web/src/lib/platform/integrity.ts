/**
 * Integrity baseline for the books.
 *
 * A failed read must not be stored as an empty ledger. That is how a blip used to wipe reservations:
 * the caller treated "could not read" as "there is nothing" and saved the empty list over the real one.
 */

export type ExpenseRow = { propertyId: string; month: string; amount: number };
export type StayRow = { propertyId: string; checkIn: string; payout: number; status?: string };

export type HouseMonth = { house: string; month: string; count: number; total: number };

export type IntegrityBaseline = {
  expenseCount: number;
  expenseTotal: number;
  reservationCount: number;
  activeReservations: number;
  payoutTotal: number;
  receiptCount: number;
  constructionTotal: number;
  expensesByHouseMonth: HouseMonth[];
  payoutsByHouseMonth: HouseMonth[];
};

function cents(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function rollup(
  rows: { house: string; month: string; amount: number }[],
): HouseMonth[] {
  const map = new Map<string, HouseMonth>();
  for (const row of rows) {
    const key = `${row.house}|${row.month}`;
    const current = map.get(key) ?? { house: row.house, month: row.month, count: 0, total: 0 };
    current.count += 1;
    current.total = cents(current.total + row.amount);
    map.set(key, current);
  }
  return [...map.values()].sort((a, b) => a.house.localeCompare(b.house) || a.month.localeCompare(b.month));
}

function monthOf(iso: string): string {
  return /^\d{4}-\d{2}/.test(iso) ? iso.slice(0, 7) : 'unknown';
}

/** Counts and totals a backup can be checked against. Cancelled stays stay in the row count and out of the payout. */
export function integrityBaseline(input: {
  expenses: ExpenseRow[];
  reservations: StayRow[];
  receiptKeys: string[];
  constructionTotal: number;
}): IntegrityBaseline {
  const expenses = input.expenses.filter((row) => Number.isFinite(row.amount));
  const stays = input.reservations.filter((row) => Number.isFinite(row.payout));
  const active = stays.filter((row) => row.status !== 'cancelled');
  return {
    expenseCount: expenses.length,
    expenseTotal: cents(expenses.reduce((sum, row) => sum + row.amount, 0)),
    reservationCount: stays.length,
    activeReservations: active.length,
    payoutTotal: cents(active.reduce((sum, row) => sum + row.payout, 0)),
    receiptCount: input.receiptKeys.length,
    constructionTotal: cents(input.constructionTotal),
    expensesByHouseMonth: rollup(
      expenses.map((row) => ({ house: row.propertyId, month: row.month, amount: row.amount })),
    ),
    payoutsByHouseMonth: rollup(
      active.map((row) => ({ house: row.propertyId, month: monthOf(row.checkIn), amount: row.payout })),
    ),
  };
}

export type LedgerRead<T> = { ok: true; rows: T[] } | { ok: false; error: string };

/**
 * A failed read is not an empty book. `save: false` means the caller must leave the stored value alone.
 * A successful read of zero rows is a real empty book and may be saved.
 */
export function acceptLedgerRead<T>(read: LedgerRead<T>): { save: false; reason: string } | { save: true; rows: T[] } {
  if (!read.ok) return { save: false, reason: read.error };
  return { save: true, rows: read.rows };
}

/** True when the destination is outside the git repo, so a snapshot cannot be committed. */
export function backupDirAllowed(repoRoot: string, dest: string): boolean {
  const norm = (value: string) => value.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  const repo = norm(repoRoot);
  const out = norm(dest);
  if (!repo || !out) return false;
  return out !== repo && !out.startsWith(`${repo}/`);
}
