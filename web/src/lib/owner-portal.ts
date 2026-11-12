import type { OwnerMonthLine, OwnerStatement } from './owner-statement';
import { MANAGEMENT_FEE_LABEL } from './owner-fee';

/** A read-only owner link. It names Todd's Ranch and River share and nothing else. */
export type OwnerAccessRecord = {
  token: string;
  createdAt: string;
  /** Set the first time the link is opened. It does not expire. */
  lastViewedAt?: string;
  /** How many times the link has been opened. */
  views?: number;
};

const TOKEN = /^[a-f0-9]{32}$/;

/** A saved link token. Anything else is not a link. */
export function isOwnerToken(value: string): boolean {
  return TOKEN.test(value);
}

/** The portal path. The token stays out of the hash so the link works on its own. */
export function ownerPortalPath(token: string): string {
  return `/owner/${token}`;
}

/** What the owner portal renders. No Lindon, no household, no construction, and no guest names. */
export type OwnerPortalView = {
  rangeLabel: string;
  todd: number;
  fee: number;
  /**
   * The fee expressed on the rent it was charged against, so the page can say "$11,469 of $57,345"
   * instead of leaving the owner to divide by the host payout and find the fee looks short. The basis
   * is rent after cleaning; cleaning is also inside `costs`, and the two cancel exactly.
   */
  feeBasis: number;
  houses: Array<{
    id: 'ranch' | 'river';
    name: string;
    revenue: number;
    costs: number;
    cleaning: number;
    estimatedCleaning: number;
    fee: number;
    leftover: number;
    todd: number;
    stays: number;
  }>;
  months: OwnerMonthLine[];
  /** Fixed sentences the page shows. They have no price. */
  notes: string[];
};

export const OWNER_PORTAL_NOTES: string[] = [
  `Ranch and River pay a ${MANAGEMENT_FEE_LABEL} management fee to Brandon first.`,
  `The ${MANAGEMENT_FEE_LABEL} is charged on rent after cleaning, not on the whole guest payout, so the fee is smaller than a fifth of the host payout line.`,
  'What remains splits in half. Todd takes one half. Brandon and Stephanie take the other half.',
  /*
   * Said before the owner finds it. Each month's fee and share are rounded to the cent and then added up, so the year's figure
   * agrees with the monthly column they can add line by line — which means doubling the year's share can differ from the
   * leftover by a cent or two. Measured on production 2026-11-10: leftover -$6,472.33 against Todd -$3,236.18. Without this
   * sentence the statement looks three cents wrong to anyone who checks it.
   */
  'Each month is rounded to the cent before the months are added, so a yearly total can differ from a straight halving of the leftover by a cent or two. The monthly column is the figure that adds up exactly.',
  'A loss after the fee splits the same way.',
  'Lindon, household purchases, and construction bills are not on this page.',
  'This page does not change a booking or a saved expense.',
];

function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Is the published share exactly half of the leftover, to the cent?
 *
 * It usually is not, by a cent or two: the share is rounded to cents **per month** and then summed, so the yearly figure agrees
 * with the monthly column an owner can add up. Measured on production 2026-11-10: `leftover -6472.33` against `todd -3236.18`,
 * a 1.5c gap.
 *
 * Lives here rather than in a component because **two** surfaces print that sentence — the host's `OwnerStatement` and the
 * owner's own `OwnerPortal` — and they must not disagree about whether the half holds. The host page was fixed first and the
 * owner page kept the old unconditional claim for a turn, which is exactly the drift a single definition prevents.
 *
 * The comparison is on the raw difference, not on two independently rounded values: rounding each side first turns the
 * production pair into a 1.7c gap and can call an exact half an error.
 */
export function halfIsExact(leftover: number, todd: number): boolean {
  return Math.abs(leftover / 2 - todd) <= 0.005;
}

export type OwnerPortalPeriod = 'month' | 'quarter' | 'ttm' | 'ytd';

/**
 * Todd's statement for the portal. Ranch and River only, and every figure is a number.
 * A statement that would carry a guest name or a note is not returned.
 */
export function ownerPortalView(statement: OwnerStatement, period: OwnerPortalPeriod): OwnerPortalView {
  const houses = statement.houses
    .filter((house) => house.id === 'ranch' || house.id === 'river')
    .map((house) => ({
      id: house.id,
      name: house.name,
      revenue: money(house.revenue),
      costs: money(house.costs),
      cleaning: money(house.cleaning),
      estimatedCleaning: money(house.estimatedCleaning ?? 0),
      fee: money(house.fee),
      leftover: money(house.leftover),
      todd: money(house.todd),
      stays: house.stays,
    }));
  const feeBasis = money(houses.reduce((total, house) => total + (house.revenue - house.cleaning), 0));
  const months = statement.months.map((row) => ({
    month: row.month,
    label: row.label,
    todd: money(row.todd),
    ranch: money(row.ranch),
    river: money(row.river),
  }));
  return {
    rangeLabel: statement.rangeLabel,
    todd: money(statement.todd),
    fee: money(statement.fee),
    feeBasis,
    houses,
    months: period === 'month' ? months.slice(-1) : months,
    notes: OWNER_PORTAL_NOTES,
  };
}

/** Informational comparison between this window's settled share and net recorded transfers. Never edits the books. */
export function ownerTransferBalanceLine(toddDollars: number, recordedCents: number): string {
  const fmt = (cents: number) =>
    (Math.abs(cents) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  const toddCents = Math.round(toddDollars * 100);
  const diffCents = toddCents - recordedCents;
  if (diffCents === 0) {
    return 'Net recorded transfers match this window’s settled share to the cent. Informational comparison only — does not edit the books.';
  }
  if (diffCents > 0) {
    return `${fmt(diffCents)} of this window’s settled share is above net recorded transfers. Informational comparison only — does not edit the books.`;
  }
  return `Net recorded transfers exceed this window’s settled share by ${fmt(diffCents)} (for example, transfers from an earlier period or a loss month). Informational comparison only — does not edit the books.`;
}

/** A statement with no months is not a statement. The page says so instead of showing a zero. */
export function ownerPortalEmpty(view: OwnerPortalView): boolean {
  return view.months.length === 0 || view.houses.length === 0;
}
