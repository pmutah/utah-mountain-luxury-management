/** Who fronted a logged bill. Brandon & Stephanie are one partner; Todd is the other. */
export type PaidBy = 'brandon' | 'todd';

export const PAID_BY_LABELS: Record<PaidBy, string> = {
  brandon: 'Brandon & Stephanie',
  todd: 'Todd',
};

export function isPaidBy(value: unknown): value is PaidBy {
  return value === 'brandon' || value === 'todd';
}

export function parsePaidBy(value: unknown): PaidBy | undefined {
  return isPaidBy(value) ? value : undefined;
}

export function tracksPartnerContributions(propertyId: string): boolean {
  return propertyId === 'construction';
}

export function isPartnerLoggedExpense(expense: { id: string; category: string }): boolean {
  return expense.id.startsWith('exp-') && expense.category !== 'Mortgage';
}

export type PartnerContributionSummary = {
  brandon: number;
  todd: number;
  unassigned: number;
  totalAssigned: number;
  eachShare: number;
  /** Positive: Todd still needs to put this in. Negative: Brandon & Stephanie still need to. */
  toddStillOwes: number;
  brandonCount: number;
  toddCount: number;
  unassignedCount: number;
  /**
   * Spend with **no receipt attached**, per payer, and how many rows.
   *
   * The ledger showed "$1,096,812.40" beside "2 receipts" and nothing else, so a partner reading it saw a large settled
   * figure with no indication that almost none of it was documented. On this project that was **$1,129,551 of $1,135,045
   * — 99.5%**. A receipt count is not evidence of coverage; the undocumented amount is the number that matters.
   */
  brandonUndocumented: number;
  toddUndocumented: number;
  undocumentedCount: number;
  /** Rows that **do** carry a receipt, per payer. The honest counterpart to the undocumented amounts. */
  brandonDocumented: number;
  toddDocumented: number;
};

export function summarizePartnerContributions(
  expenses: Array<{
    id: string;
    category: string;
    amount: number;
    propertyId: string;
    month?: string;
    paidBy?: PaidBy | string;
    /** Any of these means a receipt is attached. The store writes a path or a URL, never both. */
    receiptStoragePath?: string | null;
    receiptUrl?: string | null;
  }>,
  propertyId: string,
  month?: string,
): PartnerContributionSummary {
  const rows = expenses.filter(
    (e) =>
      e.propertyId === propertyId &&
      isPartnerLoggedExpense(e) &&
      (!month || e.month === month),
  );

  let brandon = 0;
  let todd = 0;
  let unassigned = 0;
  let brandonCount = 0;
  let toddCount = 0;
  let unassignedCount = 0;
  let brandonUndocumented = 0;
  let toddUndocumented = 0;
  let undocumentedCount = 0;
  let brandonDocumented = 0;
  let toddDocumented = 0;

  for (const e of rows) {
    const amount = Number(e.amount) || 0;
    /*
     * "Documented" means a receipt is actually attached. The store writes either a storage path (Firebase) or a URL
     * (the KV fallback), so either one counts — but a bare row with neither does not.
     */
    const documented = Boolean(e.receiptStoragePath || e.receiptUrl);
    if (e.paidBy === 'todd') {
      todd += amount;
      toddCount += 1;
      if (documented) toddDocumented += 1;
      else {
        toddUndocumented += amount;
        undocumentedCount += 1;
      }
    } else if (e.paidBy === 'brandon') {
      brandon += amount;
      brandonCount += 1;
      if (documented) brandonDocumented += 1;
      else {
        brandonUndocumented += amount;
        undocumentedCount += 1;
      }
    } else {
      unassigned += amount;
      unassignedCount += 1;
    }
  }

  const totalAssigned = brandon + todd;
  const eachShare = totalAssigned / 2;
  const toddStillOwes = brandon - eachShare;

  return {
    brandon,
    todd,
    unassigned,
    totalAssigned,
    eachShare,
    toddStillOwes,
    brandonCount,
    toddCount,
    unassignedCount,
    brandonUndocumented,
    toddUndocumented,
    undocumentedCount,
    brandonDocumented,
    toddDocumented,
  };
}
