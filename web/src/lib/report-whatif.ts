import { PROPERTIES, type RentalPropertyId } from './api';
import { managementFeeRaw } from './owner-fee';
import type { PropertyReportRow } from './report';

/**
 * Interactive Portfolio FP&A What-If Scenario Engine.
 *
 * Projects how ADR shifts, occupancy point deltas, and direct-booking channel conversion move
 * Revenue, Cleaning, Net Profit, Brandon & Stephanie's total take, and Todd's 50/50 partner share
 * across the visible properties in `#/report`.
 *
 * Pure read-only arithmetic: never writes a rate, reservation, or ledger figure.
 */

export type WhatIfControls = {
  adrDeltaPct: number; // e.g. -15 to +25
  occupancyDeltaPts: number; // e.g. -10 to +20 percentage points
  directShiftPct: number; // 0 to 40 (% of OTA revenue shifted to direct, recapturing ~3% host fee)
};

export type WhatIfHouseProjection = {
  propertyId: RentalPropertyId;
  name: string;
  baseRevenue: number;
  projectedRevenue: number;
  baseProfit: number;
  projectedProfit: number;
  projectedOccupancy: number;
  brandonTake: number;
  toddTake: number;
  mgtFee: number;
};

export type WhatIfPortfolioProjection = {
  houses: WhatIfHouseProjection[];
  baseRevenue: number;
  projectedRevenue: number;
  revenueDelta: number;
  baseProfit: number;
  projectedProfit: number;
  profitDelta: number;
  baseBrandon: number;
  projectedBrandon: number;
  baseTodd: number;
  projectedTodd: number;
  projectedMgmtFee: number;
};

function cents(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function partnerSplitForRow(
  propertyId: RentalPropertyId,
  revenue: number,
  cleaning: number,
  mortgage: number,
  operating: number,
): { brandon: number; todd: number; mgtFee: number } {
  if (propertyId === 'lindon') {
    const profit = revenue - (cleaning + mortgage + operating);
    return { brandon: cents(profit), todd: 0, mgtFee: 0 };
  }
  const basis = revenue - cleaning;
  const fee = managementFeeRaw(basis);
  const leftover = basis - fee - (mortgage + operating);
  const half = leftover / 2;
  return {
    brandon: cents(fee + half),
    todd: cents(half),
    mgtFee: cents(fee),
  };
}

export function simulatePortfolioWhatIf(
  rows: readonly PropertyReportRow[],
  controls: WhatIfControls,
): WhatIfPortfolioProjection {
  const adrMultiplier = Math.max(0.5, 1 + controls.adrDeltaPct / 100);
  const directShift = Math.max(0, Math.min(1, controls.directShiftPct / 100));
  // Host channel fee savings when shifting OTA bookings to direct (~3% host-side commission recapture)
  const DIRECT_HOST_FEE_RECAPTURE = 0.03;

  let baseRevenue = 0;
  let projectedRevenue = 0;
  let baseProfit = 0;
  let projectedProfit = 0;
  let baseBrandon = 0;
  let projectedBrandon = 0;
  let baseTodd = 0;
  let projectedTodd = 0;
  let projectedMgmtFee = 0;

  const houses: WhatIfHouseProjection[] = [];

  for (const row of rows) {
    if (row.propertyId === 'portfolio') continue;
    const propertyId = row.propertyId;
    const baseSplit = partnerSplitForRow(
      propertyId,
      row.revenue,
      row.cleaning,
      row.mortgage,
      row.operating,
    );

    const avail = row.availableNights;
    const baseOccPct = avail > 0 ? (row.occupiedNights / avail) * 100 : 0;
    const targetOccPct =
      avail > 0 ? Math.max(0, Math.min(95, baseOccPct + controls.occupancyDeltaPts)) : 0;
    const targetOccNights = avail > 0 ? (targetOccPct / 100) * avail : 0;
    const extraNights = targetOccNights - row.occupiedNights;

    // Fallback baseline ADR if a house has 0 stays in the selected window so occupancy what-if still models real potential
    const fallbackAdr = propertyId === 'river' ? 1650 : propertyId === 'ranch' ? 820 : 310;
    const effectiveBaseAdr = row.adr > 0 ? row.adr : fallbackAdr;
    const avgStayLen = row.avgLos > 0 ? row.avgLos : 3.2;

    const scaledExistingRev = row.revenue * adrMultiplier;
    const incrementalNightsRev = extraNights * (effectiveBaseAdr * adrMultiplier);
    const rawRevBeforeDirect = Math.max(0, scaledExistingRev + incrementalNightsRev);

    const otaShare =
      row.revenue > 0
        ? Math.min(1, (row.channels.Airbnb.revenue + row.channels.VRBO.revenue) / row.revenue)
        : 0.85;
    const directFeeGain = rawRevBeforeDirect * otaShare * directShift * DIRECT_HOST_FEE_RECAPTURE;
    const projRev = cents(rawRevBeforeDirect + directFeeGain);

    // Incremental cleaning turns scale with incremental nights / avgStayLen
    const incrementalTurns = extraNights / avgStayLen;
    const projCleaning = cents(
      Math.max(0, row.cleaning + incrementalTurns * PROPERTIES[propertyId].cleaningFee),
    );
    const projProfit = cents(projRev - (row.mortgage + projCleaning + row.operating));
    const projSplit = partnerSplitForRow(
      propertyId,
      projRev,
      projCleaning,
      row.mortgage,
      row.operating,
    );

    baseRevenue = cents(baseRevenue + row.revenue);
    projectedRevenue = cents(projectedRevenue + projRev);
    baseProfit = cents(baseProfit + row.profit);
    projectedProfit = cents(projectedProfit + projProfit);
    baseBrandon = cents(baseBrandon + baseSplit.brandon);
    projectedBrandon = cents(projectedBrandon + projSplit.brandon);
    baseTodd = cents(baseTodd + baseSplit.todd);
    projectedTodd = cents(projectedTodd + projSplit.todd);
    projectedMgmtFee = cents(projectedMgmtFee + projSplit.mgtFee);

    houses.push({
      propertyId,
      name: row.name,
      baseRevenue: row.revenue,
      projectedRevenue: projRev,
      baseProfit: row.profit,
      projectedProfit: projProfit,
      projectedOccupancy: Math.round(targetOccPct * 10) / 10,
      brandonTake: projSplit.brandon,
      toddTake: projSplit.todd,
      mgtFee: projSplit.mgtFee,
    });
  }

  return {
    houses,
    baseRevenue,
    projectedRevenue,
    revenueDelta: cents(projectedRevenue - baseRevenue),
    baseProfit,
    projectedProfit,
    profitDelta: cents(projectedProfit - baseProfit),
    baseBrandon,
    projectedBrandon,
    baseTodd,
    projectedTodd,
    projectedMgmtFee,
  };
}
