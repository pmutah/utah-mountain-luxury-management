import { APP_NAME } from './brand';
import type { PortfolioData } from './api';
import { formatCurrency, PROPERTIES } from './api';
import { postsRevenue, revenueOf } from './cancellation-income';
import { formatMonthLabel } from './months';
import { visibleHouses } from './luxury';

const HOUSE_LABEL: Record<string, string> = { ranch: 'Ranch', lindon: 'Lindon', river: 'River' };

export function portfolioToCsv(data: PortfolioData): string {
  /*
   * Only the houses in this payload.
   *
   * This wrote all three unconditionally, so an owner's export carried Lindon's revenue, profit, occupancy, and stays — and then the
   * guest list below carried every Lindon guest's name. A spreadsheet is the worst place for that: it is saved, mailed, and kept.
   * The server omits Lindon as `null`, so the row is skipped rather than printed as a zero.
   */
  const houses = visibleHouses(data);
  const rows: string[] = [
    `${APP_NAME} — ${formatMonthLabel(data.month)}`,
    '',
    'Property,Revenue,Profit,Occupancy %,Stays',
    ...houses.map((house) => {
      const metrics = data[house]!;
      return `${HOUSE_LABEL[house]},${metrics.revenue},${metrics.profit},${metrics.occupancy.toFixed(1)},${metrics.stayCount}`;
    }),
    `Total,${data.totalRevenue ?? houses.reduce((sum, house) => sum + data[house]!.revenue, 0)},${data.totalProfit ?? houses.reduce((sum, house) => sum + data[house]!.profit, 0)},,`,
    '',
    'Guest,Property,Check-in,Check-out,Payout,Source,Status',
  ];
  /*
   * Only rows that post revenue, and the figure they actually earned.
   *
   * A cancelled stay used to appear here with its full `payout` — the money it would have made — so the spreadsheet
   * disagreed with the board above it. It now appears only when the channel kept a fee, and then it prints the fee.
   * The status column is what tells a reader the last row is a cancellation and not a stay.
   *
   * The house filter is the same list the header rows use, so a guest cannot reach the file for a house that was left out above.
   */
  for (const r of data.reservations.filter(
    (res) => houses.includes(res.propertyId as (typeof houses)[number]) && res.checkIn.startsWith(data.month) && postsRevenue(res),
  )) {
    rows.push(
      `"${r.guestName}",${PROPERTIES[r.propertyId]?.name ?? r.propertyId},${r.checkIn},${r.checkOut},${revenueOf(r)},${r.source},${r.status ?? 'confirmed'}`,
    );
  }
  return rows.join('\n');
}

export function portfolioSummaryText(data: PortfolioData): string {
  const houses = visibleHouses(data);
  const rev = data.totalRevenue ?? houses.reduce((sum, house) => sum + data[house]!.revenue, 0);
  const profit = data.totalProfit ?? houses.reduce((sum, house) => sum + data[house]!.profit, 0);
  return [
    `${APP_NAME} — ${formatMonthLabel(data.month)}`,
    `Revenue: ${formatCurrency(rev)}`,
    `Net profit: ${formatCurrency(profit)}`,
    ...houses.map((house) => {
      const metrics = data[house]!;
      return `${HOUSE_LABEL[house]}: ${formatCurrency(metrics.revenue)} (${metrics.stayCount} stays)`;
    }),
  ].join('\n');
}

export function downloadCsv(data: PortfolioData) {
  const blob = new Blob([portfolioToCsv(data)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `utah-mountain-luxury-${data.month}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function copySummary(data: PortfolioData): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(portfolioSummaryText(data));
    return true;
  } catch {
    return false;
  }
}
