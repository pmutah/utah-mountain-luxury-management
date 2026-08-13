import {
  PROPERTIES,
  type Expense,
  type OwnerDistribution,
  type RentalPropertyId,
  type Reservation,
} from './api';
import { addMonths } from './months';

export const REPORT_PROPERTY_IDS: RentalPropertyId[] = ['ranch', 'lindon', 'river'];
export const RIVER_OPEN_MONTH = '2026-10';

export type ReportPeriod = 'month' | 'ytd' | 'ttm';
export type ChannelName = 'Airbnb' | 'VRBO' | 'Other';

export type ChannelSlice = {
  channel: ChannelName;
  stays: number;
  stayNights: number;
  occupiedNights: number;
  revenue: number;
};

export type PropertyReportRow = {
  propertyId: RentalPropertyId | 'portfolio';
  name: string;
  revenue: number;
  profit: number;
  stayCount: number;
  stayNights: number;
  occupiedNights: number;
  availableNights: number;
  occupancy: number;
  adr: number;
  revpar: number;
  avgLos: number;
  avgBooking: number;
  margin: number;
  mortgage: number;
  cleaning: number;
  operating: number;
  dist: OwnerDistribution | null;
  channels: Record<ChannelName, ChannelSlice>;
};

export type MonthlyReportPoint = {
  month: string;
  revenue: number;
  profit: number;
  stayCount: number;
  occupiedNights: number;
  availableNights: number;
  occupancy: number;
  airbnb: number;
  vrbo: number;
  other: number;
};

export type PortfolioReportModel = {
  period: ReportPeriod;
  startMonth: string;
  endMonth: string;
  months: string[];
  properties: PropertyReportRow[];
  totals: PropertyReportRow;
  monthly: MonthlyReportPoint[];
  expensesByCategory: Array<{ category: string; amount: number }>;
  forward: { stays: number; nights: number; revenue: number };
  topStays: Reservation[];
};

const EMPTY_CHANNEL = (channel: ChannelName): ChannelSlice => ({
  channel,
  stays: 0,
  stayNights: 0,
  occupiedNights: 0,
  revenue: 0,
});

export function isActiveStay(r: Reservation): boolean {
  return r.status !== 'cancelled' && r.status !== 'blocked';
}

export function channelLabel(source: string): ChannelName {
  if (/airbnb/i.test(source)) return 'Airbnb';
  if (/vrbo|homeaway/i.test(source)) return 'VRBO';
  return 'Other';
}

export function stayNights(checkIn: string, checkOut: string): number {
  const start = new Date(`${checkIn}T00:00:00`);
  const end = new Date(`${checkOut}T00:00:00`);
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86_400_000));
}

export function daysInMonth(ym: string): number {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

export function lastDayOfMonth(ym: string): string {
  return `${ym}-${String(daysInMonth(ym)).padStart(2, '0')}`;
}

export function occupiedNightsInMonth(checkIn: string, checkOut: string, ym: string): number {
  const days = daysInMonth(ym);
  let n = 0;
  for (let d = 1; d <= days; d++) {
    const iso = `${ym}-${String(d).padStart(2, '0')}`;
    if (iso >= checkIn && iso < checkOut) n++;
  }
  return n;
}

export function monthRangeInclusive(start: string, end: string): string[] {
  const out: string[] = [];
  let cur = start;
  while (cur <= end) {
    out.push(cur);
    cur = addMonths(cur, 1);
    if (out.length > 36) break;
  }
  return out;
}

export function periodMonths(period: ReportPeriod, endMonth: string): string[] {
  if (period === 'month') return [endMonth];
  if (period === 'ytd') return monthRangeInclusive(`${endMonth.slice(0, 4)}-01`, endMonth);
  return monthRangeInclusive(addMonths(endMonth, -11), endMonth);
}

export function isPropertyOpen(id: RentalPropertyId, month: string): boolean {
  if (id === 'river') return month >= RIVER_OPEN_MONTH;
  return true;
}

function emptyChannels(): Record<ChannelName, ChannelSlice> {
  return {
    Airbnb: EMPTY_CHANNEL('Airbnb'),
    VRBO: EMPTY_CHANNEL('VRBO'),
    Other: EMPTY_CHANNEL('Other'),
  };
}

function addChannel(target: ChannelSlice, add: ChannelSlice) {
  target.stays += add.stays;
  target.stayNights += add.stayNights;
  target.occupiedNights += add.occupiedNights;
  target.revenue += add.revenue;
}

function ownerSplit(
  propertyId: RentalPropertyId,
  revenue: number,
  cleaning: number,
  mortgage: number,
  operating: number,
): OwnerDistribution | null {
  if (propertyId !== 'ranch' && propertyId !== 'river') return null;
  const basis = revenue - cleaning;
  const mgtFee = basis > 0 ? basis * 0.2 : 0;
  const leftover = basis - mgtFee - (mortgage + operating);
  const share = leftover > 0 ? leftover / 2 : 0;
  return { brandon: mgtFee + share, todd: share, mgtFee };
}

function ratio(num: number, den: number): number {
  return den > 0 ? num / den : 0;
}

function finalizeRow(row: Omit<PropertyReportRow, 'occupancy' | 'adr' | 'revpar' | 'avgLos' | 'avgBooking' | 'margin'>): PropertyReportRow {
  return {
    ...row,
    occupancy: ratio(row.occupiedNights, row.availableNights) * 100,
    adr: ratio(row.revenue, row.stayNights),
    revpar: ratio(row.revenue, row.availableNights),
    avgLos: ratio(row.stayNights, row.stayCount),
    avgBooking: ratio(row.revenue, row.stayCount),
    margin: ratio(row.profit, row.revenue) * 100,
  };
}

function monthPropertyMetrics(
  propertyId: RentalPropertyId,
  month: string,
  reservations: Reservation[],
  expenses: Expense[],
  extraCleaningFees: Record<string, number>,
): PropertyReportRow {
  const open = isPropertyOpen(propertyId, month);
  const availableNights = open ? daysInMonth(month) : 0;
  const active = reservations.filter((r) => r.propertyId === propertyId && isActiveStay(r));
  const checkIns = active.filter((r) => r.checkIn.startsWith(month));
  const channels = emptyChannels();

  let revenue = 0;
  let stayNightsTotal = 0;
  for (const res of checkIns) {
    const nights = stayNights(res.checkIn, res.checkOut);
    const payout = Number(res.payout) || 0;
    revenue += payout;
    stayNightsTotal += nights;
    const ch = channels[channelLabel(res.source)];
    ch.stays += 1;
    ch.stayNights += nights;
    ch.revenue += payout;
  }

  let occupiedNights = 0;
  for (const res of active) {
    const nights = occupiedNightsInMonth(res.checkIn, res.checkOut, month);
    occupiedNights += nights;
    channels[channelLabel(res.source)].occupiedNights += nights;
  }

  const extra = Number(extraCleaningFees[`${propertyId}-${month}`] || 0);
  const cleaningExpenses = expenses
    .filter((e) => e.propertyId === propertyId && e.month === month && e.category === 'Cleaning')
    .reduce((sum, e) => sum + e.amount, 0);
  const stayCount = checkIns.length;
  const baseCleaning =
    cleaningExpenses > 0 ? cleaningExpenses : stayCount * PROPERTIES[propertyId].cleaningFee;
  const cleaning = open ? baseCleaning + extra : 0;
  const mortgage = open ? PROPERTIES[propertyId].mortgage : 0;
  const operating = expenses
    .filter(
      (e) =>
        e.propertyId === propertyId &&
        e.month === month &&
        e.category !== 'Mortgage' &&
        e.category !== 'Cleaning',
    )
    .reduce((sum, e) => sum + e.amount, 0);
  const profit = revenue - (mortgage + cleaning + operating);

  return finalizeRow({
    propertyId,
    name: PROPERTIES[propertyId].name,
    revenue,
    profit,
    stayCount,
    stayNights: stayNightsTotal,
    occupiedNights,
    availableNights,
    mortgage,
    cleaning,
    operating,
    dist: ownerSplit(propertyId, revenue, cleaning, mortgage, operating),
    channels,
  });
}

function sumDist(rows: PropertyReportRow[]): OwnerDistribution | null {
  const parts = rows.map((r) => r.dist).filter((d): d is OwnerDistribution => d != null);
  if (parts.length === 0) return null;
  return parts.reduce(
    (acc, d) => ({
      brandon: acc.brandon + d.brandon,
      todd: acc.todd + d.todd,
      mgtFee: acc.mgtFee + d.mgtFee,
    }),
    { brandon: 0, todd: 0, mgtFee: 0 },
  );
}

function sumRows(rows: PropertyReportRow[], name: string, propertyId: PropertyReportRow['propertyId']): PropertyReportRow {
  const channels = emptyChannels();
  let revenue = 0;
  let profit = 0;
  let stayCount = 0;
  let stayNightsTotal = 0;
  let occupiedNights = 0;
  let availableNights = 0;
  let mortgage = 0;
  let cleaning = 0;
  let operating = 0;
  for (const row of rows) {
    revenue += row.revenue;
    profit += row.profit;
    stayCount += row.stayCount;
    stayNightsTotal += row.stayNights;
    occupiedNights += row.occupiedNights;
    availableNights += row.availableNights;
    mortgage += row.mortgage;
    cleaning += row.cleaning;
    operating += row.operating;
    addChannel(channels.Airbnb, row.channels.Airbnb);
    addChannel(channels.VRBO, row.channels.VRBO);
    addChannel(channels.Other, row.channels.Other);
  }
  return finalizeRow({
    propertyId,
    name,
    revenue,
    profit,
    stayCount,
    stayNights: stayNightsTotal,
    occupiedNights,
    availableNights,
    mortgage,
    cleaning,
    operating,
    dist: sumDist(rows),
    channels,
  });
}

export function buildPortfolioReport(
  endMonth: string,
  period: ReportPeriod,
  reservations: Reservation[],
  expenses: Expense[],
  extraCleaningFees: Record<string, number> = {},
): PortfolioReportModel {
  const months = periodMonths(period, endMonth);
  const startMonth = months[0] ?? endMonth;
  const propertyAcc: Record<RentalPropertyId, PropertyReportRow[]> = {
    ranch: [],
    lindon: [],
    river: [],
  };
  const monthly: MonthlyReportPoint[] = [];

  for (const month of months) {
    const monthRows = REPORT_PROPERTY_IDS.map((id) =>
      monthPropertyMetrics(id, month, reservations, expenses, extraCleaningFees),
    );
    for (const row of monthRows) {
      if (row.propertyId !== 'portfolio') propertyAcc[row.propertyId].push(row);
    }
    const tot = sumRows(monthRows, 'Portfolio', 'portfolio');
    monthly.push({
      month,
      revenue: tot.revenue,
      profit: tot.profit,
      stayCount: tot.stayCount,
      occupiedNights: tot.occupiedNights,
      availableNights: tot.availableNights,
      occupancy: tot.occupancy,
      airbnb: tot.channels.Airbnb.revenue,
      vrbo: tot.channels.VRBO.revenue,
      other: tot.channels.Other.revenue,
    });
  }

  const properties = REPORT_PROPERTY_IDS.map((id) => sumRows(propertyAcc[id], PROPERTIES[id].name, id));
  const totals = sumRows(properties, 'All properties', 'portfolio');

  const monthSet = new Set(months);
  const expensesByCategory = new Map<string, number>();
  expensesByCategory.set('Mortgage', totals.mortgage);
  expensesByCategory.set('Cleaning', totals.cleaning);
  for (const e of expenses) {
    if (!monthSet.has(e.month)) continue;
    if (e.category === 'Mortgage' || e.category === 'Cleaning') continue;
    if (!REPORT_PROPERTY_IDS.includes(e.propertyId as RentalPropertyId)) continue;
    expensesByCategory.set(e.category, (expensesByCategory.get(e.category) ?? 0) + e.amount);
  }

  const periodEnd = lastDayOfMonth(endMonth);
  const forwardStays = reservations.filter(
    (r) => isActiveStay(r) && r.checkIn > periodEnd && REPORT_PROPERTY_IDS.includes(r.propertyId as RentalPropertyId),
  );
  const checkInStays = reservations
    .filter(
      (r) =>
        isActiveStay(r) &&
        REPORT_PROPERTY_IDS.includes(r.propertyId as RentalPropertyId) &&
        months.some((m) => r.checkIn.startsWith(m)),
    )
    .sort((a, b) => b.payout - a.payout);

  return {
    period,
    startMonth,
    endMonth,
    months,
    properties,
    totals,
    monthly,
    expensesByCategory: [...expensesByCategory.entries()]
      .map(([category, amount]) => ({ category, amount }))
      .filter((row) => row.amount !== 0)
      .sort((a, b) => b.amount - a.amount),
    forward: {
      stays: forwardStays.length,
      nights: forwardStays.reduce((sum, r) => sum + stayNights(r.checkIn, r.checkOut), 0),
      revenue: forwardStays.reduce((sum, r) => sum + (Number(r.payout) || 0), 0),
    },
    topStays: checkInStays.slice(0, 8),
  };
}

export function reportPeriodLabel(period: ReportPeriod): string {
  if (period === 'month') return 'This month';
  if (period === 'ytd') return 'Year to date';
  return 'Trailing 12 months';
}
