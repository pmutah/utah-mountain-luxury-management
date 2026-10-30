import type { Expense, Reservation } from './api';
import { formatMonthLabel } from './months';
import { buildPortfolioReport, type ReportPeriod } from './report';

export type OwnerHouseLine = {
  id: 'ranch' | 'river';
  name: string;
  revenue: number;
  costs: number;
  todd: number;
  stays: number;
};

export type OwnerMonthLine = {
  month: string;
  label: string;
  todd: number;
};

export type OwnerStatement = {
  rangeLabel: string;
  todd: number;
  fee: number;
  houses: OwnerHouseLine[];
  months: OwnerMonthLine[];
};

/** Round each month to cents, then put any leftover penny on the last month so the column matches the total. */
export function footOwnerMonths(total: number, months: readonly OwnerMonthLine[]): OwnerMonthLine[] {
  const cents = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
  const rows = months.map((row) => ({ ...row, todd: cents(row.todd) }));
  if (rows.length === 0) return rows;
  const summed = cents(rows.reduce((sum, row) => sum + row.todd, 0));
  const drift = cents(cents(total) - summed);
  const last = rows[rows.length - 1]!;
  last.todd = cents(last.todd + drift);
  return rows;
}

/** Todd's Ranch and River statement. Lindon is left out. The books are not changed. */
export function buildOwnerStatement(
  endMonth: string,
  period: ReportPeriod,
  reservations: Reservation[],
  expenses: Expense[],
  extraCleaningFees: Record<string, number> = {},
): OwnerStatement {
  const report = buildPortfolioReport(endMonth, period, reservations, expenses, extraCleaningFees, 'all', 'todd');
  const houses: OwnerHouseLine[] = report.properties.flatMap((row) => {
    if (row.propertyId !== 'ranch' && row.propertyId !== 'river') return [];
    return [
      {
        id: row.propertyId,
        name: row.name,
        revenue: row.revenue,
        costs: row.mortgage + row.cleaning + row.operating,
        todd: row.dist?.todd ?? 0,
        stays: row.stayCount,
      },
    ];
  });
  const range =
    report.period === 'month'
      ? formatMonthLabel(report.endMonth)
      : `${formatMonthLabel(report.startMonth)} – ${formatMonthLabel(report.endMonth)}`;
  return {
    rangeLabel: range,
    todd: report.totals.dist?.todd ?? 0,
    fee: report.totals.dist?.mgtFee ?? 0,
    houses,
    months: footOwnerMonths(
      report.totals.dist?.todd ?? 0,
      report.monthly.map((point) => ({
        month: point.month,
        label: formatMonthLabel(point.month),
        todd: point.profit,
      })),
    ),
  };
}
