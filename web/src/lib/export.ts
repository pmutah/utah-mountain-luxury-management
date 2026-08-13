import type { PortfolioData } from './api';
import { formatCurrency, PROPERTIES } from './api';
import { formatMonthLabel } from './months';

export function portfolioToCsv(data: PortfolioData): string {
  const rows: string[] = [
    `Utah Mountain Luxury — ${formatMonthLabel(data.month)}`,
    '',
    'Property,Revenue,Profit,Occupancy %,Stays',
    `Ranch,${data.ranch.revenue},${data.ranch.profit},${data.ranch.occupancy.toFixed(1)},${data.ranch.stayCount}`,
    `Lindon,${data.lindon.revenue},${data.lindon.profit},${data.lindon.occupancy.toFixed(1)},${data.lindon.stayCount}`,
    `River,${data.river.revenue},${data.river.profit},${data.river.occupancy.toFixed(1)},${data.river.stayCount}`,
    `Total,${data.totalRevenue ?? data.ranch.revenue + data.lindon.revenue + data.river.revenue},${data.totalProfit ?? data.ranch.profit + data.lindon.profit + data.river.profit},,`,
    '',
    'Guest,Property,Check-in,Check-out,Payout,Source',
  ];
  for (const r of data.reservations.filter((res) => res.checkIn.startsWith(data.month))) {
    rows.push(
      `"${r.guestName}",${PROPERTIES[r.propertyId]?.name ?? r.propertyId},${r.checkIn},${r.checkOut},${r.payout},${r.source}`,
    );
  }
  return rows.join('\n');
}

export function portfolioSummaryText(data: PortfolioData): string {
  const rev = data.ranch.revenue + data.lindon.revenue + data.river.revenue;
  const profit = data.ranch.profit + data.lindon.profit + data.river.profit;
  return [
    `Utah Mountain Luxury — ${formatMonthLabel(data.month)}`,
    `Revenue: ${formatCurrency(rev)}`,
    `Net profit: ${formatCurrency(profit)}`,
    `Ranch: ${formatCurrency(data.ranch.revenue)} (${data.ranch.stayCount} stays)`,
    `Lindon: ${formatCurrency(data.lindon.revenue)} (${data.lindon.stayCount} stays)`,
    `River: ${formatCurrency(data.river.revenue)} (${data.river.stayCount} stays)`,
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
