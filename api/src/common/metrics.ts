import { PROPERTIES, type PropertyId } from './constants';

export interface Reservation {
  id: string;
  guestName: string;
  propertyId: PropertyId;
  checkIn: string;
  checkOut: string;
  payout: number;
  source: string;
}

export interface Expense {
  id: string;
  month: string;
  propertyId: PropertyId;
  category: string;
  amount: number;
  note?: string;
  vendor?: string;
}

export interface OwnerDistribution {
  brandon: number;
  todd: number;
  mgtFee: number;
}

export interface PropertyMetrics {
  propertyId: PropertyId;
  revenue: number;
  baseCleaning: number;
  extra: number;
  totalCleaning: number;
  mortgage: number;
  operationalExpenses: number;
  profit: number;
  occupancy: number;
  stayCount: number;
  dist: OwnerDistribution | null;
}

export function getOverlappingNights(
  checkIn: string,
  checkOut: string,
  targetYearMonth: string,
): number {
  const [year, month] = targetYearMonth.split('-');
  const monthStart = new Date(Number(year), Number(month) - 1, 1);
  const monthEnd = new Date(Number(year), Number(month), 0);
  const start = new Date(`${checkIn}T00:00:00`);
  const end = new Date(`${checkOut}T00:00:00`);
  const actualStart = start < monthStart ? monthStart : start;
  const actualEnd = end > monthEnd ? monthEnd : end;
  if (actualStart >= actualEnd) return 0;
  return Math.round((actualEnd.getTime() - actualStart.getTime()) / (1000 * 60 * 60 * 24));
}

export function calculateMetrics(
  propId: PropertyId,
  currentMonth: string,
  reservations: Reservation[],
  expenses: Expense[],
  extraCleaningFees: Record<string, number>,
): PropertyMetrics {
  let revenue = 0;
  let baseCleaning = 0;
  let occupied = 0;
  let stayCount = 0;

  reservations
    .filter((r) => r.propertyId === propId)
    .forEach((res) => {
      if (res.checkIn.startsWith(currentMonth)) {
        revenue += Number(res.payout);
        baseCleaning += PROPERTIES[propId].cleaningFee;
        stayCount++;
      }
      occupied += getOverlappingNights(res.checkIn, res.checkOut, currentMonth);
    });

  const extra = Number(extraCleaningFees[`${propId}-${currentMonth}`] || 0);
  const totalCleaning = baseCleaning + extra;
  const mortgage = PROPERTIES[propId].mortgage;

  const operationalExpenses = expenses
    .filter(
      (e) =>
        e.propertyId === propId &&
        e.month === currentMonth &&
        e.category !== 'Mortgage',
    )
    .reduce((sum, e) => sum + e.amount, 0);

  const totalCosts = mortgage + totalCleaning + operationalExpenses;
  const [yearStr, monthStr] = currentMonth.split('-');
  const days = new Date(Number(yearStr), Number(monthStr), 0).getDate();
  const profit = revenue - totalCosts;

  let dist: OwnerDistribution | null = null;
  if (propId === 'ranch') {
    const basis = revenue - totalCleaning;
    const mgtFee = basis > 0 ? basis * 0.2 : 0;
    const leftover = basis - mgtFee - (mortgage + operationalExpenses);
    const share = leftover > 0 ? leftover / 2 : 0;
    dist = { brandon: mgtFee + share, todd: share, mgtFee };
  }

  return {
    propertyId: propId,
    revenue,
    baseCleaning,
    extra,
    totalCleaning,
    mortgage,
    operationalExpenses,
    profit,
    occupancy: (occupied / days) * 100,
    stayCount,
    dist,
  };
}
