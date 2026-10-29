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

export type OwnerStatement = {
  rangeLabel: string;
  todd: number;
  fee: number;
  houses: OwnerHouseLine[];
};

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
  };
}
