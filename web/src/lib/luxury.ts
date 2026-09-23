import {
  formatCurrency,
  PROPERTIES,
  type PortfolioData,
  type PropertyMetrics,
  type Reservation,
} from './api';
import { currentDayIso, formatMonthLabel } from './months';

export type HouseId = 'ranch' | 'lindon' | 'river';

export function portfolioRevenue(data: PortfolioData) {
  return data.ranch.revenue + data.lindon.revenue + data.river.revenue;
}

export function portfolioProfit(data: PortfolioData) {
  return data.ranch.profit + data.lindon.profit + data.river.profit;
}

export function formatWhole(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value || 0);
}

export interface WaterfallBand {
  key: string;
  label: string;
  detail: string;
  value: number;
  color: string;
}

export function waterfallBands(data: PortfolioData, only?: HouseId): WaterfallBand[] {
  const metrics = only ? [data[only]] : [data.ranch, data.lindon, data.river];
  const sum = (pick: (m: PropertyMetrics) => number) => metrics.reduce((s, m) => s + pick(m), 0);
  const distFee = (id: HouseId) => (only && only !== id ? 0 : (data[id].dist?.mgtFee ?? 0));
  const distSide = (id: HouseId, side: 'brandon' | 'todd') =>
    only && only !== id ? 0 : (data[id].dist?.[side] ?? 0);

  const includeLindon = !only || only === 'lindon';
  const brandon =
    distSide('ranch', 'brandon') + distSide('river', 'brandon') + (includeLindon ? data.lindon.profit : 0);
  const todd = distSide('ranch', 'todd') + distSide('river', 'todd');
  const fee = distFee('ranch') + distFee('river');

  const bands: WaterfallBand[] = [
    {
      key: 'cleaning',
      label: 'Cleaning',
      detail: 'Turnover',
      value: sum((m) => m.totalCleaning),
      color: '#3d8f8a',
    },
    {
      key: 'mortgage',
      label: 'Mortgage',
      detail: 'Carrying cost',
      value: sum((m) => m.mortgage),
      color: '#6d8f86',
    },
    {
      key: 'ops',
      label: 'Operating',
      detail: 'Utilities, repairs, supplies',
      value: sum((m) => m.operationalExpenses),
      color: '#8a7350',
    },
    {
      key: 'todd',
      label: 'Todd Wilhite',
      detail: '50% after the management fee',
      value: todd,
      color: '#c5b08a',
    },
    {
      key: 'brandon',
      label: 'Brandon & Stephanie',
      detail: fee > 0 ? `Includes ${formatCurrency(fee)} management fee` : 'Owner share',
      value: brandon,
      color: '#d4b56a',
    },
  ];
  return bands.filter((b) => Math.abs(b.value) >= 0.5);
}

export function hostPayout(data: PortfolioData, only?: HouseId) {
  if (only) return data[only].revenue;
  return portfolioRevenue(data);
}

export interface HealthFactor {
  label: string;
  ask: string;
}

export interface HealthScore {
  score: number;
  factors: HealthFactor[];
}

export function propertyHealth(id: HouseId, metrics: PropertyMetrics): HealthScore {
  const name = PROPERTIES[id].name;
  const occ = Math.max(0, Math.min(100, metrics.occupancy));
  const margin =
    metrics.revenue > 0
      ? Math.max(0, Math.min(100, (metrics.profit / metrics.revenue) * 100))
      : metrics.profit >= 0
        ? 55
        : 25;
  const expenseHealth =
    metrics.revenue > 0
      ? Math.max(0, Math.min(100, 100 - (metrics.operationalExpenses / metrics.revenue) * 120))
      : 70;
  const stayHealth = Math.min(100, metrics.stayCount * 22);
  const score = Math.round(occ * 0.45 + margin * 0.3 + expenseHealth * 0.15 + stayHealth * 0.1);
  const factors: HealthFactor[] = [];
  if (occ < 85) {
    factors.push({
      label: `Occupancy is ${occ.toFixed(0)}%`,
      ask: `Which nights are open at ${name} and what rate should we ask?`,
    });
  }
  if (metrics.revenue > 0 && metrics.profit / metrics.revenue < 0.25) {
    factors.push({
      label: 'Margin is thin after costs',
      ask: `What is pulling profit down at ${name} this month?`,
    });
  }
  if (metrics.operationalExpenses > 400) {
    factors.push({
      label: `${formatCurrency(metrics.operationalExpenses)} in operating bills`,
      ask: `List this month's operating expenses at ${name}.`,
    });
  }
  if (metrics.stayCount === 0) {
    factors.push({
      label: 'No stays on the books',
      ask: `Is ${name} blocked, vacant, or missing reservations this month?`,
    });
  }
  if (factors.length === 0) {
    factors.push({
      label: 'Holding a quiet, full month',
      ask: `Summarize ${name} for the partners in two sentences.`,
    });
  }
  return { score: Math.max(0, Math.min(100, score)), factors };
}

function nextStay(reservations: Reservation[]) {
  const today = currentDayIso();
  return reservations
    .filter((r) => r.status !== 'cancelled' && r.status !== 'blocked' && r.checkOut > today)
    .sort((a, b) => a.checkIn.localeCompare(b.checkIn))[0];
}

export function morningBriefing(data: PortfolioData): string {
  const rev = portfolioRevenue(data);
  const prev = data.previous?.totalRevenue;
  const month = formatMonthLabel(data.month);
  const houses: Array<{ name: string; occ: number }> = [
    { name: 'Ranch', occ: data.ranch.occupancy },
    { name: 'Lindon', occ: data.lindon.occupancy },
    { name: 'River', occ: data.river.occupancy },
  ].sort((a, b) => b.occ - a.occ);
  const lead = houses[0];
  let opener = `${month} shows ${formatWhole(rev)} in host payouts.`;
  if (prev != null && prev !== 0) {
    const delta = rev - prev;
    opener = `${month} is ${formatWhole(Math.abs(delta))} ${delta >= 0 ? 'ahead of' : 'behind'} last month.`;
  }
  const booked = `${lead.name} is ${lead.occ.toFixed(0)}% booked.`;
  const upcoming = nextStay(data.reservations);
  if (!upcoming) return `${opener} ${booked}`;
  const when = new Date(`${upcoming.checkIn}T00:00:00`).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const house = PROPERTIES[upcoming.propertyId]?.name ?? upcoming.propertyId;
  const arrived = upcoming.checkIn <= currentDayIso();
  const stayLine = arrived
    ? `${upcoming.guestName} is in house at ${house} through ${upcoming.checkOut.slice(5)}.`
    : `Next arrival ${when}: ${upcoming.guestName} at ${house}.`;
  return `${opener} ${booked} ${stayLine}`;
}

export interface NightMark {
  doy: number;
  payout: number;
  propertyId: string;
}

export function nightsInYear(year: number, reservations: Reservation[], propertyId?: string) {
  const marks = new Map<number, NightMark>();
  for (const stay of reservations) {
    if (propertyId && stay.propertyId !== propertyId) continue;
    if (stay.status === 'cancelled' || stay.status === 'blocked') continue;
    const start = new Date(`${stay.checkIn}T00:00:00`);
    const end = new Date(`${stay.checkOut}T00:00:00`);
    const nights = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000));
    const perNight = stay.payout / nights;
    for (let t = start.getTime(); t < end.getTime(); t += 86400000) {
      const day = new Date(t);
      if (day.getFullYear() !== year) continue;
      const doy = Math.round((day.getTime() - new Date(year, 0, 1).getTime()) / 86400000);
      const prev = marks.get(doy);
      if (!prev || perNight > prev.payout) {
        marks.set(doy, { doy, payout: perNight, propertyId: stay.propertyId });
      }
    }
  }
  return marks;
}

export function daysInYear(year: number) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 366 : 365;
}
