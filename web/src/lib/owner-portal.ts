import type { OwnerMonthLine, OwnerStatement } from './owner-statement';

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
  'Ranch and River pay a 20% management fee to Brandon first.',
  'The 20% is charged on rent after cleaning, not on the whole guest payout, so the fee is smaller than a fifth of the host payout line.',
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
 * Todd's statement for the portal. Ranch and River only, and every figure is a number.
 * A statement that would carry a guest name or a note is not returned.
 */
export function ownerPortalView(statement: OwnerStatement, period: 'month' | 'ytd'): OwnerPortalView {
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

/** A statement with no months is not a statement. The page says so instead of showing a zero. */
export function ownerPortalEmpty(view: OwnerPortalView): boolean {
  return view.months.length === 0 || view.houses.length === 0;
}
