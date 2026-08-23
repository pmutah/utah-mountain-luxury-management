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
  return propertyId === 'ranch' || propertyId === 'river';
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
  toddStillOwes: number;
  brandonCount: number;
  toddCount: number;
  unassignedCount: number;
};

export function summarizePartnerContributions(
  expenses: Array<{
    id: string;
    category: string;
    amount: number;
    propertyId: string;
    month?: string;
    paidBy?: PaidBy | string;
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

  for (const e of rows) {
    const amount = Number(e.amount) || 0;
    if (e.paidBy === 'todd') {
      todd += amount;
      toddCount += 1;
    } else if (e.paidBy === 'brandon') {
      brandon += amount;
      brandonCount += 1;
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
  };
}
