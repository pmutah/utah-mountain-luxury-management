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
  ranch: number;
  river: number;
};

export type OwnerStatement = {
  rangeLabel: string;
  todd: number;
  fee: number;
  houses: OwnerHouseLine[];
  months: OwnerMonthLine[];
};

function cents(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Put a leftover penny on River so the two houses match the month. */
export function footOwnerHouses(total: number, ranch: number, river: number): { ranch: number; river: number } {
  const ranchCents = cents(ranch);
  const riverCents = cents(river + (cents(total) - cents(ranchCents + cents(river))));
  return { ranch: ranchCents, river: riverCents };
}

/** Move pennies between Ranch and River so the Ranch column matches that house. Each month total stays the same, so River follows. */
export function footOwnerColumns(ranchTarget: number, months: readonly OwnerMonthLine[]): OwnerMonthLine[] {
  if (months.length === 0) return [];
  const rows = months.map((row) => ({ ...row }));
  const ranchSum = cents(rows.reduce((sum, row) => sum + row.ranch, 0));
  const drift = cents(cents(ranchTarget) - ranchSum);
  const last = rows[rows.length - 1]!;
  last.ranch = cents(last.ranch + drift);
  last.river = cents(last.river - drift);
  return rows;
}

/** Round each month to cents, then put any leftover penny on the last month so the column matches the total. */
export function footOwnerMonths(total: number, months: readonly OwnerMonthLine[]): OwnerMonthLine[] {
  const rows = months.map((row) => ({ ...row, todd: cents(row.todd), ranch: cents(row.ranch), river: cents(row.river) }));
  if (rows.length === 0) return rows;
  const summed = cents(rows.reduce((sum, row) => sum + row.todd, 0));
  const drift = cents(cents(total) - summed);
  const last = rows[rows.length - 1]!;
  last.todd = cents(last.todd + drift);
  return rows.map((row) => ({ ...row, ...footOwnerHouses(row.todd, row.ranch, row.river) }));
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
  const rawHouses: OwnerHouseLine[] = report.properties.flatMap((row) => {
    if (row.propertyId !== 'ranch' && row.propertyId !== 'river') return [];
    return [
      {
        id: row.propertyId,
        name: row.name,
        revenue: cents(row.revenue),
        costs: cents(row.mortgage + row.cleaning + row.operating),
        todd: cents(row.dist?.todd ?? 0),
        stays: row.stayCount,
      },
    ];
  });
  const range =
    report.period === 'month'
      ? formatMonthLabel(report.endMonth)
      : `${formatMonthLabel(report.startMonth)} – ${formatMonthLabel(report.endMonth)}`;
  const houses = rawHouses.map((house) => ({ ...house, todd: cents(house.todd) }));
  return {
    rangeLabel: range,
    // Rounded to cents so a float artefact like 1908.3439999999998 never reaches a statement.
    todd: cents(report.totals.dist?.todd ?? 0),
    fee: cents(report.totals.dist?.mgtFee ?? 0),
    houses,
    months: footOwnerColumns(
      houses.find((house) => house.id === 'ranch')?.todd ?? 0,
      footOwnerMonths(
        cents(report.totals.dist?.todd ?? 0),
        report.monthly.map((point) => ({
          month: point.month,
          label: formatMonthLabel(point.month),
          todd: point.profit,
          ranch: point.ranchProfit,
          river: point.riverProfit,
        })),
      ),
    ),
  };
}
