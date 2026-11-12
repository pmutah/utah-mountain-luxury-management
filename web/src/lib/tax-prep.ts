import { PROPERTIES, type Expense, type RentalPropertyId, type Reservation } from './api';
import { cancellationIncomeOf } from './cancellation-income';
import { isActiveStay, isPropertyOpen, occupiedNightsInMonth, REPORT_PROPERTY_IDS, stayNights } from './report';
import { form1099Totals, lodgingTaxReport, schEExport, type DirectStay } from './platform/back-office';
import { CLEANER_PAY } from './platform/guest-ops';
import { MANAGEMENT_FEE_RATE } from './owner-fee';

/**
 * Institutional STR Tax Preparation & CPA Accounting Engine.
 *
 * Synthesizes Schedule E Part I line-by-line mapping, §1.469-1T(e)(3)(ii)(A) 7-day average customer stay
 * qualification, §280A(d)(1) 14-day / 10% personal-use safe-harbor tracking, §469 material participation
 * hours vs cleaner turnover hours, IRS mileage presets, 1099-NEC vendor thresholds ($600+), and Utah
 * lodging tax reconciliation.
 *
 * Hard lock: Tax year 2025 is FILED and LOCKED (`schEExport().included === false`). Live worksheets and
 * CSV exports run strictly for 2026+ and never alter or blend 2025 filed figures.
 */

export const IRS_MILEAGE_RATE_ESTIMATE = 0.7;

export type ScheduleELineKey =
  | 'line3_rents'
  | 'line5_advertising'
  | 'line6_auto_travel'
  | 'line7_cleaning_maintenance'
  | 'line9_insurance'
  | 'line10_legal_professional'
  | 'line11_management_fees'
  | 'line12_mortgage_interest_note'
  | 'line14_repairs'
  | 'line15_supplies'
  | 'line16_taxes'
  | 'line17_utilities'
  | 'line19_other';

export type ScheduleELineMeta = {
  key: ScheduleELineKey;
  irsLine: string;
  label: string;
  isIncome?: boolean;
  isNoteOnly?: boolean;
};

export const SCHEDULE_E_LINES: readonly ScheduleELineMeta[] = [
  { key: 'line3_rents', irsLine: 'Line 3', label: 'Rents received (host net + cancellation fees)', isIncome: true },
  { key: 'line5_advertising', irsLine: 'Line 5', label: 'Advertising & direct marketing' },
  { key: 'line6_auto_travel', irsLine: 'Line 6', label: 'Auto and travel (logged IRS mileage preview)' },
  { key: 'line7_cleaning_maintenance', irsLine: 'Line 7', label: 'Cleaning and maintenance (receipts + extra)' },
  { key: 'line9_insurance', irsLine: 'Line 9', label: 'Insurance' },
  { key: 'line10_legal_professional', irsLine: 'Line 10', label: 'Legal and professional fees (CPA / legal)' },
  { key: 'line11_management_fees', irsLine: 'Line 11', label: 'Management fees (external only; partner fee noted separately)' },
  {
    key: 'line12_mortgage_interest_note',
    irsLine: 'Line 12',
    label: 'Mortgage cash service (replace with Form 1098 interest on return)',
    isNoteOnly: true,
  },
  { key: 'line14_repairs', irsLine: 'Line 14', label: 'Repairs' },
  { key: 'line15_supplies', irsLine: 'Line 15', label: 'Supplies & guest consumables' },
  { key: 'line16_taxes', irsLine: 'Line 16', label: 'Taxes (property & local permits)' },
  { key: 'line17_utilities', irsLine: 'Line 17', label: 'Utilities (electric, gas, water, trash, Wi-Fi)' },
  { key: 'line19_other', irsLine: 'Line 19', label: 'Other operating expenses (HOA, snow, landscaping, software)' },
];

function cents(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function mapCategoryToScheduleELine(category: string): Exclude<ScheduleELineKey, 'line3_rents' | 'line12_mortgage_interest_note'> {
  const norm = category.trim().toLowerCase();
  if (/advertis|marketing|photo|listing/.test(norm)) return 'line5_advertising';
  if (/auto|travel|mileage|fuel/.test(norm)) return 'line6_auto_travel';
  if (/clean|laundry|linen|turnover|hot tub|pest|lawn|landscap|snow|plow/.test(norm)) return 'line7_cleaning_maintenance';
  if (/insur/.test(norm)) return 'line9_insurance';
  if (/legal|cpa|account|attorney|tax prep|permit/.test(norm)) return 'line10_legal_professional';
  if (/manag/.test(norm)) return 'line11_management_fees';
  if (/repair|plumb|hvac|electr.*fix|handyman|appliance/.test(norm)) return 'line14_repairs';
  if (/suppl|consumable|coffee|soap|paper|welcome/.test(norm)) return 'line15_supplies';
  if (/property tax|county tax|transient tax|tax/.test(norm)) return 'line16_taxes';
  if (/util|power|gas|electric|water|sewer|trash|internet|wifi|wi-fi|cable|dominion|rocky mountain/.test(norm)) {
    return 'line17_utilities';
  }
  return 'line19_other';
}

export type StrStayRuleResult = {
  propertyId: RentalPropertyId;
  name: string;
  stayCount: number;
  totalStayNights: number;
  occupiedCalendarNights: number;
  averageStayDays: number | null;
  status: 'qualifies-7day' | 'substantial-services-30day' | 'exceeds-30day' | 'no-stays';
  statusLabel: string;
  longStaysOver7: Array<{ id: string; checkIn: string; checkOut: string; nights: number; source: string }>;
  personalUseCeilingDays: number;
};

export type PropertyScheduleEColumn = {
  propertyId: RentalPropertyId;
  name: string;
  lines: Record<ScheduleELineKey, number>;
  deductibleOperatingTotal: number;
  netBefore1098AndDepreciation: number;
  cashDebtServiceMemo: number;
  assumedCleaningMemo: number;
  partnerManagementFeeMemo: number;
  missingReceiptsCount: number;
  enteredExpenseCount: number;
};

export type Vendor1099Candidate = {
  vendor: string;
  amount: number;
  count: number;
  status: 'requires-1099-review' | 'approaching' | 'under';
  note: string;
};

export type ParticipationEntry = {
  id: string;
  date: string;
  propertyId: RentalPropertyId | 'portfolio';
  hours: number;
  category: 'ops-pricing' | 'turnover-inspection' | 'repairs-maint' | 'bookkeeping-tax' | 'river-setup';
  note: string;
};

export type MileageTripEntry = {
  id: string;
  date: string;
  propertyId: RentalPropertyId;
  routeLabel: string;
  miles: number;
  purpose: string;
};

export type MileagePreset = {
  id: string;
  label: string;
  propertyId: RentalPropertyId;
  roundTripMiles: number;
  defaultPurpose: string;
};

export const UTAH_MILEAGE_PRESETS: readonly MileagePreset[] = [
  {
    id: 'lindon-ranch',
    label: 'Lindon Office ↔ Ranch House (Center St)',
    propertyId: 'ranch',
    roundTripMiles: 2.4,
    defaultPurpose: 'Property inspection & guest turnover check',
  },
  {
    id: 'lindon-lindon',
    label: 'Lindon Office ↔ Lindon House (Harcliff Cir)',
    propertyId: 'lindon',
    roundTripMiles: 1.8,
    defaultPurpose: 'Property inspection & maintenance check',
  },
  {
    id: 'lindon-river',
    label: 'Lindon Office ↔ River House (Vivian Park)',
    propertyId: 'river',
    roundTripMiles: 27.6,
    defaultPurpose: 'Canyon property check, river/sauna prep & supplies',
  },
  {
    id: 'lindon-orem-supply',
    label: 'Orem Costco / Home Depot ↔ Ranch or Lindon',
    propertyId: 'ranch',
    roundTripMiles: 8.4,
    defaultPurpose: 'Restock house supplies & maintenance hardware',
  },
  {
    id: 'slc-river-run',
    label: 'SLC Vendor Pickup ↔ River House (Provo Canyon)',
    propertyId: 'river',
    roundTripMiles: 96.0,
    defaultPurpose: 'Specialty furnishings / equipment pickup & delivery',
  },
];

export type TaxYearPacket = {
  year: number;
  locked2025: boolean;
  lockReason: string | null;
  properties: PropertyScheduleEColumn[];
  portfolioLines: Record<ScheduleELineKey, number>;
  totalRents: number;
  totalDeductibleBefore1098: number;
  netBefore1098AndDepreciation: number;
  totalCashDebtServiceMemo: number;
  strRules: StrStayRuleResult[];
  vendors1099: Vendor1099Candidate[];
  lodgingTax: ReturnType<typeof lodgingTaxReport>;
  cleanerEstimatedHours: Record<RentalPropertyId, number>;
  totalCleanerEstimatedHours: number;
};

function emptyLines(): Record<ScheduleELineKey, number> {
  return {
    line3_rents: 0,
    line5_advertising: 0,
    line6_auto_travel: 0,
    line7_cleaning_maintenance: 0,
    line9_insurance: 0,
    line10_legal_professional: 0,
    line11_management_fees: 0,
    line12_mortgage_interest_note: 0,
    line14_repairs: 0,
    line15_supplies: 0,
    line16_taxes: 0,
    line17_utilities: 0,
    line19_other: 0,
  };
}

function yearMonths(year: number): string[] {
  return Array.from({ length: 12 }, (_, idx) => `${year}-${String(idx + 1).padStart(2, '0')}`);
}

export function buildTaxYearPacket(input: {
  year: number;
  reservations: Reservation[];
  expenses: Expense[];
  extraCleaningFees?: Record<string, number>;
  mileageTrips?: MileageTripEntry[];
}): TaxYearPacket {
  const { year, reservations, expenses, extraCleaningFees = {}, mileageTrips = [] } = input;

  if (year <= 2025) {
    const lock = schEExport();
    return {
      year,
      locked2025: true,
      lockReason: lock.reason,
      properties: [],
      portfolioLines: emptyLines(),
      totalRents: 0,
      totalDeductibleBefore1098: 0,
      netBefore1098AndDepreciation: 0,
      totalCashDebtServiceMemo: 0,
      strRules: [],
      vendors1099: [],
      lodgingTax: lodgingTaxReport([]),
      cleanerEstimatedHours: { ranch: 0, lindon: 0, river: 0 },
      totalCleanerEstimatedHours: 0,
    };
  }

  const months = yearMonths(year);
  const yearPrefix = `${year}-`;
  const portfolioLines = emptyLines();
  const properties: PropertyScheduleEColumn[] = [];
  const strRules: StrStayRuleResult[] = [];
  const cleanerEstimatedHours: Record<RentalPropertyId, number> = { ranch: 0, lindon: 0, river: 0 };
  const payeeInputs: Array<{ name: string; amount: number }> = [];
  const vendorCounts = new Map<string, number>();
  const lodgingInputs: DirectStay[] = [];

  for (const propertyId of REPORT_PROPERTY_IDS) {
    const lines = emptyLines();
    const active = reservations.filter((r) => r.propertyId === propertyId && isActiveStay(r));
    const yearStays = active.filter((r) => r.checkIn.startsWith(yearPrefix));

    let stayNightsSum = 0;
    const longStaysOver7: StrStayRuleResult['longStaysOver7'] = [];

    for (const stay of yearStays) {
      const nights = stayNights(stay.checkIn, stay.checkOut);
      const payout = Number(stay.payout) || 0;
      lines.line3_rents = cents(lines.line3_rents + payout);
      stayNightsSum += nights;

      if (nights > 7) {
        longStaysOver7.push({
          id: stay.id,
          checkIn: stay.checkIn,
          checkOut: stay.checkOut,
          nights,
          source: stay.source,
        });
      }

      const channelNorm: DirectStay['channel'] = /airbnb/i.test(stay.source)
        ? 'airbnb'
        : /vrbo|homeaway/i.test(stay.source)
          ? 'vrbo'
          : 'direct';
      lodgingInputs.push({
        house: propertyId,
        lodging: stay.guestTotal ?? payout,
        cleaning: 0,
        channel: channelNorm,
      });
    }

    // Cancellation fees paid out in this tax year
    for (const row of reservations) {
      if (row.propertyId !== propertyId || !row.checkIn.startsWith(yearPrefix)) continue;
      const fee = cancellationIncomeOf(row);
      if (fee > 0) {
        lines.line3_rents = cents(lines.line3_rents + fee);
      }
    }

    // Calendar nights actually occupied inside `year` (for §280A(d)(1) fair-rental days)
    let occupiedCalendarNights = 0;
    for (const ym of months) {
      if (!isPropertyOpen(propertyId, ym)) continue;
      for (const stay of active) {
        occupiedCalendarNights += occupiedNightsInMonth(stay.checkIn, stay.checkOut, ym);
      }
    }

    // Cleaner estimated hours per turnover (Ranch ~5h, River ~6h, Lindon ~3.5h)
    const hoursPerTurn = propertyId === 'river' ? 6 : propertyId === 'ranch' ? 5 : 3.5;
    cleanerEstimatedHours[propertyId] = cents(yearStays.length * hoursPerTurn);

    // Mileage preview on Line 6
    const houseMiles = mileageTrips
      .filter((trip) => trip.propertyId === propertyId && trip.date.startsWith(yearPrefix))
      .reduce((sum, trip) => sum + (Number(trip.miles) || 0), 0);
    if (houseMiles > 0) {
      lines.line6_auto_travel = cents(lines.line6_auto_travel + houseMiles * IRS_MILEAGE_RATE_ESTIMATE);
    }

    // Logged property expenses for this tax year
    const propExpenses = expenses.filter(
      (e) => e.propertyId === propertyId && e.month.startsWith(yearPrefix),
    );
    let missingReceiptsCount = 0;
    let enteredExpenseCount = 0;
    let assumedCleaningMemo = 0;
    let cashDebtServiceMemo = 0;

    for (const ym of months) {
      if (!isPropertyOpen(propertyId, ym)) continue;
      cashDebtServiceMemo = cents(cashDebtServiceMemo + PROPERTIES[propertyId].mortgage);

      const monthCheckIns = active.filter((r) => r.checkIn.startsWith(ym)).length;
      const loggedMonthCleaning = propExpenses
        .filter((e) => e.month === ym && e.category === 'Cleaning')
        .reduce((sum, e) => sum + e.amount, 0);
      const extraClean = Number(extraCleaningFees[`${propertyId}-${ym}`] || 0);

      if (extraClean > 0) {
        lines.line7_cleaning_maintenance = cents(lines.line7_cleaning_maintenance + extraClean);
      }
      if (loggedMonthCleaning === 0 && monthCheckIns > 0) {
        const assumed = monthCheckIns * PROPERTIES[propertyId].cleaningFee;
        assumedCleaningMemo = cents(assumedCleaningMemo + assumed);
        const cleanerUnit = CLEANER_PAY[propertyId];
        if (cleanerUnit !== null) {
          payeeInputs.push({ name: CLEANER_PAY.name, amount: monthCheckIns * cleanerUnit });
          vendorCounts.set(CLEANER_PAY.name, (vendorCounts.get(CLEANER_PAY.name) ?? 0) + monthCheckIns);
        }
      }
    }

    for (const exp of propExpenses) {
      if (exp.category === 'Mortgage') continue;
      enteredExpenseCount += 1;
      if (!exp.receiptStoragePath && !exp.receiptUrl) {
        missingReceiptsCount += 1;
      }
      const lineKey = mapCategoryToScheduleELine(exp.category);
      lines[lineKey] = cents(lines[lineKey] + exp.amount);

      const vendorName = (exp.vendor ?? '').trim();
      if (vendorName) {
        payeeInputs.push({ name: vendorName, amount: exp.amount });
        vendorCounts.set(vendorName, (vendorCounts.get(vendorName) ?? 0) + 1);
      }
    }

    lines.line12_mortgage_interest_note = cashDebtServiceMemo;

    const deductibleOperatingTotal = cents(
      lines.line5_advertising +
        lines.line6_auto_travel +
        lines.line7_cleaning_maintenance +
        lines.line9_insurance +
        lines.line10_legal_professional +
        lines.line11_management_fees +
        lines.line14_repairs +
        lines.line15_supplies +
        lines.line16_taxes +
        lines.line17_utilities +
        lines.line19_other,
    );

    const netBefore1098AndDepreciation = cents(lines.line3_rents - deductibleOperatingTotal);
    const partnerManagementFeeMemo =
      propertyId === 'ranch' || propertyId === 'river'
        ? cents(Math.max(0, lines.line3_rents - lines.line7_cleaning_maintenance - assumedCleaningMemo) * MANAGEMENT_FEE_RATE)
        : 0;

    properties.push({
      propertyId,
      name: PROPERTIES[propertyId].name,
      lines,
      deductibleOperatingTotal,
      netBefore1098AndDepreciation,
      cashDebtServiceMemo,
      assumedCleaningMemo,
      partnerManagementFeeMemo,
      missingReceiptsCount,
      enteredExpenseCount,
    });

    for (const meta of SCHEDULE_E_LINES) {
      portfolioLines[meta.key] = cents(portfolioLines[meta.key] + lines[meta.key]);
    }

    const avgDays = yearStays.length > 0 ? Math.round((stayNightsSum / yearStays.length) * 100) / 100 : null;
    const status: StrStayRuleResult['status'] =
      avgDays === null
        ? 'no-stays'
        : avgDays <= 7
          ? 'qualifies-7day'
          : avgDays <= 30
            ? 'substantial-services-30day'
            : 'exceeds-30day';

    const statusLabel =
      status === 'qualifies-7day'
        ? `Qualifies ≤ 7.0 days (${avgDays}d avg) — non-rental STR exception (§1.469-1T(e)(3)(ii)(A))`
        : status === 'substantial-services-30day'
          ? `${avgDays}d average (> 7.0 days) — requires substantial personal services to avoid passive rental classification`
          : status === 'exceeds-30day'
            ? `${avgDays}d average (> 30 days) — treated as residential/rental activity`
            : 'No completed or active stays recorded in this tax year yet';

    strRules.push({
      propertyId,
      name: PROPERTIES[propertyId].name,
      stayCount: yearStays.length,
      totalStayNights: stayNightsSum,
      occupiedCalendarNights,
      averageStayDays: avgDays,
      status,
      statusLabel,
      longStaysOver7,
      personalUseCeilingDays: Math.max(14, Math.floor(occupiedCalendarNights * 0.1)),
    });
  }

  const vendorTotals = form1099Totals(payeeInputs).sort((a, b) => b.amount - a.amount);
  const vendors1099: Vendor1099Candidate[] = vendorTotals.map((row) => {
    const status: Vendor1099Candidate['status'] =
      row.amount >= 600 ? 'requires-1099-review' : row.amount >= 400 ? 'approaching' : 'under';
    return {
      vendor: row.name,
      amount: row.amount,
      count: vendorCounts.get(row.name) ?? 1,
      status,
      note:
        status === 'requires-1099-review'
          ? 'At or above $600. Verify W-9 and exclude credit-card/processor payments reported on 1099-K.'
          : status === 'approaching'
            ? 'Between $400 and $599 — collect W-9 proactively before year-end.'
            : 'Under $600 threshold.',
    };
  });

  const totalRents = portfolioLines.line3_rents;
  const totalDeductibleBefore1098 = cents(
    properties.reduce((sum, p) => sum + p.deductibleOperatingTotal, 0),
  );
  const netBefore1098AndDepreciation = cents(totalRents - totalDeductibleBefore1098);
  const totalCashDebtServiceMemo = portfolioLines.line12_mortgage_interest_note;
  const totalCleanerEstimatedHours = cents(
    cleanerEstimatedHours.ranch + cleanerEstimatedHours.lindon + cleanerEstimatedHours.river,
  );

  return {
    year,
    locked2025: false,
    lockReason: null,
    properties,
    portfolioLines,
    totalRents,
    totalDeductibleBefore1098,
    netBefore1098AndDepreciation,
    totalCashDebtServiceMemo,
    strRules,
    vendors1099,
    lodgingTax: lodgingTaxReport(lodgingInputs),
    cleanerEstimatedHours,
    totalCleanerEstimatedHours,
  };
}

export function evaluateMaterialParticipation(input: {
  entries: ParticipationEntry[];
  year: number;
  cleanerHoursByProperty: Record<RentalPropertyId, number>;
}): {
  totalHours: number;
  byProperty: Record<RentalPropertyId | 'portfolio', number>;
  passes500HourSafeHarbor: boolean;
  passes100HourAndMoreThanOthers: boolean;
  maxSingleWorkerHours: number;
  hoursTo100: number;
  hoursTo500: number;
} {
  const prefix = `${input.year}-`;
  const byProperty: Record<RentalPropertyId | 'portfolio', number> = {
    ranch: 0,
    lindon: 0,
    river: 0,
    portfolio: 0,
  };
  for (const row of input.entries) {
    if (!row.date.startsWith(prefix)) continue;
    const h = Number(row.hours) || 0;
    if (h <= 0) continue;
    byProperty[row.propertyId] = cents(byProperty[row.propertyId] + h);
  }
  const totalHours = cents(byProperty.ranch + byProperty.lindon + byProperty.river + byProperty.portfolio);
  const totalCleaner = cents(
    input.cleanerHoursByProperty.ranch + input.cleanerHoursByProperty.lindon + input.cleanerHoursByProperty.river,
  );
  return {
    totalHours,
    byProperty,
    passes500HourSafeHarbor: totalHours >= 500,
    passes100HourAndMoreThanOthers: totalHours >= 100 && totalHours > totalCleaner,
    maxSingleWorkerHours: totalCleaner,
    hoursTo100: cents(Math.max(0, 100 - totalHours)),
    hoursTo500: cents(Math.max(0, 500 - totalHours)),
  };
}

function csvCell(value: string | number): string {
  const text = String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function taxPacketToCsv(packet: TaxYearPacket, participationHours = 0, totalMiles = 0): string {
  if (packet.locked2025) {
    return `Utah Mountain Luxury — Tax Year ${packet.year}\nLocked,${csvCell(packet.lockReason ?? '2025 return is filed and locked.')}`;
  }

  const lines: string[] = [
    `Utah Mountain Luxury — CPA Schedule E & STR Worksheet (${packet.year})`,
    'Note,Replace Line 12 cash mortgage service with Form 1098 deductible interest and add CPA depreciation (Form 4562).',
    '',
    'IRS Line,Description,Ranch House,Lindon House,River House,Portfolio Total',
  ];

  const propMap = new Map(packet.properties.map((p) => [p.propertyId, p]));
  for (const meta of SCHEDULE_E_LINES) {
    lines.push(
      [
        csvCell(meta.irsLine),
        csvCell(meta.label),
        propMap.get('ranch')?.lines[meta.key] ?? 0,
        propMap.get('lindon')?.lines[meta.key] ?? 0,
        propMap.get('river')?.lines[meta.key] ?? 0,
        packet.portfolioLines[meta.key],
      ].join(','),
    );
  }

  lines.push(
    [
      'Total OpEx',
      'Deductible operating expenses before Form 1098 & depreciation',
      propMap.get('ranch')?.deductibleOperatingTotal ?? 0,
      propMap.get('lindon')?.deductibleOperatingTotal ?? 0,
      propMap.get('river')?.deductibleOperatingTotal ?? 0,
      packet.totalDeductibleBefore1098,
    ].join(','),
  );
  lines.push(
    [
      'Net Before 1098/Dep',
      'Rents minus logged operating expenses',
      propMap.get('ranch')?.netBefore1098AndDepreciation ?? 0,
      propMap.get('lindon')?.netBefore1098AndDepreciation ?? 0,
      propMap.get('river')?.netBefore1098AndDepreciation ?? 0,
      packet.netBefore1098AndDepreciation,
    ].join(','),
  );

  lines.push('');
  lines.push('STR §1.469-1T(e)(3)(ii)(A) & §280A(d)(1) Tests');
  lines.push('Property,Active Stays,Stay Nights,Avg Stay (Days),Qualifies <= 7.0d,Fair Rental Calendar Days,§280A Safe Harbor Personal Days');
  for (const rule of packet.strRules) {
    lines.push(
      [
        csvCell(rule.name),
        rule.stayCount,
        rule.totalStayNights,
        rule.averageStayDays ?? 'N/A',
        rule.status === 'qualifies-7day' ? 'YES' : 'NO',
        rule.occupiedCalendarNights,
        rule.personalUseCeilingDays,
      ].join(','),
    );
  }

  lines.push('');
  lines.push(`Material Participation Hours Logged (${packet.year}),${participationHours}`);
  lines.push(`Estimated Cleaner Turnover Hours (${packet.year}),${packet.totalCleanerEstimatedHours}`);
  lines.push(`Logged Business Miles (${packet.year}),${totalMiles}`);

  if (packet.vendors1099.length > 0) {
    lines.push('');
    lines.push('1099-NEC Vendor Review');
    lines.push('Vendor,Total Paid,Items,Status');
    for (const v of packet.vendors1099) {
      lines.push([csvCell(v.vendor), v.amount, v.count, v.status].join(','));
    }
  }

  return lines.join('\n');
}
