import type { Expense } from './api';

/**
 * STR Engineering Cost-Segregation & IRC §168(k) Bonus Depreciation Simulator.
 *
 * When a short-term rental has an average customer stay of 7.0 days or less, the building is classified
 * under IRC §168(e)(2)(A) as 39-year nonresidential real property rather than 27.5-year residential rental
 * property — making an engineering cost-segregation study (carving out 5-, 7-, and 15-year MACRS property
 * eligible for bonus depreciation) especially impactful in the year placed in service.
 *
 * Planning estimator only for CPA review with Ben Campbell. Never alters ledger rows or files a return.
 */

export const UTAH_FLAT_TAX_RATE = 0.0455;

export type CostSegProfileId = 'conservative' | 'luxury-lodge' | 'high-amenity';

export type CostSegProfile = {
  id: CostSegProfileId;
  label: string;
  pct5Year: number;
  pct7Year: number;
  pct15Year: number;
  pct39Year: number;
  description: string;
};

export const COST_SEG_PROFILES: readonly CostSegProfile[] = [
  {
    id: 'conservative',
    label: 'Conservative (22% accelerated)',
    pct5Year: 0.12,
    pct7Year: 0.03,
    pct15Year: 0.07,
    pct39Year: 0.78,
    description: 'Standard custom home finishes, appliances, carpet/LVT, and modest exterior flatwork.',
  },
  {
    id: 'luxury-lodge',
    label: 'Luxury Mountain Lodge (30% accelerated)',
    pct5Year: 0.16,
    pct7Year: 0.04,
    pct15Year: 0.10,
    pct39Year: 0.70,
    description: 'Two full kitchens, bunk millwork, barrel sauna, hot tub & pergola, EV chargers, and riverside sitework.',
  },
  {
    id: 'high-amenity',
    label: 'High-Amenity Resort Estate (36% accelerated)',
    pct5Year: 0.19,
    pct7Year: 0.05,
    pct15Year: 0.12,
    pct39Year: 0.64,
    description: 'Heavy specialty millwork, dedicated theater/arcade/game garage, extensive retaining walls, and outdoor living.',
  },
];

export type BonusRateOption = 0 | 0.4 | 0.6 | 0.8 | 1;

export type CostSegBucketBreakdown = {
  bucket: '5-year' | '7-year' | '15-year' | '39-year';
  allocationUsd: number;
  bonusUsd: number;
  regularMacrsYear1Usd: number;
  totalYear1Usd: number;
  examples: string;
};

export type CostSegSimulation = {
  grossBasisUsd: number;
  landAllocationUsd: number;
  depreciableBasisUsd: number;
  placedInServiceMonth: number; // 1..12
  bonusRate: BonusRateOption;
  marginalFedRate: number;
  includeUtahTax: boolean;
  combinedTaxRate: number;
  ownershipShare: 1 | 0.5;
  buckets: CostSegBucketBreakdown[];
  straightLine39Year1Usd: number;
  acceleratedYear1TotalUsd: number;
  additionalYear1DeductionUsd: number;
  ownerShareYear1DeductionUsd: number;
  estimatedYear1TaxSavingsUsd: number;
};

function cents(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * 39-year nonresidential real property Year-1 MACRS mid-month convention rate by month placed in service (IRS Pub 946 Table A-7a).
 * For November (month 11), 1.5 months / 12 / 39 = 0.321%.
 */
export function macrs39Year1Rate(placedInServiceMonth: number): number {
  const m = Math.max(1, Math.min(12, Math.round(placedInServiceMonth)));
  const monthsInService = 12 - m + 0.5;
  return monthsInService / (12 * 39);
}

export function sumLoggedConstructionSpend(expenses: readonly Expense[]): {
  total: number;
  brandon: number;
  todd: number;
  count: number;
} {
  let total = 0;
  let brandon = 0;
  let todd = 0;
  let count = 0;
  for (const exp of expenses) {
    if (exp.propertyId !== 'construction') continue;
    const amt = Number(exp.amount) || 0;
    if (amt <= 0) continue;
    total = cents(total + amt);
    count += 1;
    if (exp.paidBy === 'todd') todd = cents(todd + amt);
    else brandon = cents(brandon + amt);
  }
  return { total, brandon, todd, count };
}

export function simulateCostSegregation(input: {
  grossBasisUsd: number;
  landValuePct: number; // 0..0.6
  profileId: CostSegProfileId;
  bonusRate: BonusRateOption;
  placedInServiceMonth: number; // 1..12 (River = 11 for Nov)
  marginalFedRate: number; // e.g. 0.24, 0.32, 0.35, 0.37
  includeUtahTax?: boolean;
  ownershipShare?: 1 | 0.5;
}): CostSegSimulation {
  const grossBasisUsd = cents(Math.max(0, input.grossBasisUsd));
  const landPct = Math.max(0, Math.min(0.6, input.landValuePct));
  const landAllocationUsd = cents(grossBasisUsd * landPct);
  const depreciableBasisUsd = cents(Math.max(0, grossBasisUsd - landAllocationUsd));

  const profile =
    COST_SEG_PROFILES.find((p) => p.id === input.profileId) ?? COST_SEG_PROFILES[1]!;

  const placedMonth = Math.max(1, Math.min(12, Math.round(input.placedInServiceMonth || 11)));
  const rate39 = macrs39Year1Rate(placedMonth);

  // Half-year convention Year-1 MACRS rates on remaining non-bonus basis (IRS Pub 946 Table A-1)
  const regularRates = {
    five: 0.20, // 200% DB half-year
    seven: 0.1429, // 200% DB half-year
    fifteen: 0.05, // 150% DB half-year
  };

  function computeShortBucket(
    bucket: '5-year' | '7-year' | '15-year',
    share: number,
    regRate: number,
    examples: string,
  ): CostSegBucketBreakdown {
    const allocationUsd = cents(depreciableBasisUsd * share);
    const bonusUsd = cents(allocationUsd * input.bonusRate);
    const remainder = Math.max(0, allocationUsd - bonusUsd);
    const regularMacrsYear1Usd = cents(remainder * regRate);
    const totalYear1Usd = cents(bonusUsd + regularMacrsYear1Usd);
    return {
      bucket,
      allocationUsd,
      bonusUsd,
      regularMacrsYear1Usd,
      totalYear1Usd,
      examples,
    };
  }

  const b5 = computeShortBucket(
    '5-year',
    profile.pct5Year,
    regularRates.five,
    'Dual-kitchen appliances, furniture, carpets/LVT, window treatments, decorative lighting',
  );
  const b7 = computeShortBucket(
    '7-year',
    profile.pct7Year,
    regularRates.seven,
    'Game-garage arcade & pool fixtures, theater seating, custom bunk/cabinetry hardware',
  );
  const b15 = computeShortBucket(
    '15-year',
    profile.pct15Year,
    regularRates.fifteen,
    'Barrel sauna & hot-tub pad, timber pergola, EV charger pedestals, driveway, riverside paths & fencing',
  );

  const alloc39 = cents(
    Math.max(0, depreciableBasisUsd - (b5.allocationUsd + b7.allocationUsd + b15.allocationUsd)),
  );
  const reg39 = cents(alloc39 * rate39);
  const b39: CostSegBucketBreakdown = {
    bucket: '39-year',
    allocationUsd: alloc39,
    bonusUsd: 0,
    regularMacrsYear1Usd: reg39,
    totalYear1Usd: reg39,
    examples: 'Structural framing, foundation, roof, core plumbing, electrical & HVAC',
  };

  const straightLine39Year1Usd = cents(depreciableBasisUsd * rate39);
  const acceleratedYear1TotalUsd = cents(
    b5.totalYear1Usd + b7.totalYear1Usd + b15.totalYear1Usd + b39.totalYear1Usd,
  );
  const additionalYear1DeductionUsd = cents(
    Math.max(0, acceleratedYear1TotalUsd - straightLine39Year1Usd),
  );

  const includeUtahTax = input.includeUtahTax !== false;
  const combinedTaxRate = Math.min(
    0.5,
    Math.max(0, input.marginalFedRate + (includeUtahTax ? UTAH_FLAT_TAX_RATE : 0)),
  );
  const ownershipShare = input.ownershipShare ?? 0.5;
  const ownerShareYear1DeductionUsd = cents(acceleratedYear1TotalUsd * ownershipShare);
  const estimatedYear1TaxSavingsUsd = cents(ownerShareYear1DeductionUsd * combinedTaxRate);

  return {
    grossBasisUsd,
    landAllocationUsd,
    depreciableBasisUsd,
    placedInServiceMonth: placedMonth,
    bonusRate: input.bonusRate,
    marginalFedRate: input.marginalFedRate,
    includeUtahTax,
    combinedTaxRate: Math.round(combinedTaxRate * 10000) / 10000,
    ownershipShare,
    buckets: [b5, b7, b15, b39],
    straightLine39Year1Usd,
    acceleratedYear1TotalUsd,
    additionalYear1DeductionUsd,
    ownerShareYear1DeductionUsd,
    estimatedYear1TaxSavingsUsd,
  };
}
