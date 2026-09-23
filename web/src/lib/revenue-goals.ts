import type { Reservation } from './api';

/** Keep in step with AIRBNB_KEEP and VRBO_KEEP in pricing-doctrine.ts. */
export const AIRBNB_KEEP = 0.845;
export const VRBO_KEEP = 0.92;

export function listPricesForHostNet(hostNet: number) {
  return {
    airbnb: Math.ceil(hostNet / AIRBNB_KEEP),
    vrbo: Math.ceil(hostNet / VRBO_KEEP),
  };
}

/** Host-payout gross. Keep web/functions/_lib/pricing-doctrine.ts ANNUAL_GROSS_GOAL in step. */
export const ANNUAL_GROSS_GOAL = {
  lindon: 40_000,
  ranch: 140_000,
  river: 400_000,
} as const;

export type GoalHouse = keyof typeof ANNUAL_GROSS_GOAL;

export function goalWindow(propertyId: GoalHouse, asOf: string) {
  if (propertyId === 'river') {
    const year = Number(asOf.slice(0, 4));
    const novThisYear = `${year}-11-01`;
    const start = asOf < '2026-11-01' ? '2026-11-01' : asOf >= novThisYear ? novThisYear : `${year - 1}-11-01`;
    const endYear = Number(start.slice(0, 4)) + 1;
    const end = `${endYear}-11-01`;
    return { start, end, label: `Nov ${start.slice(0, 4)} – Oct ${endYear}` };
  }
  const year = asOf.slice(0, 4);
  return { start: `${year}-01-01`, end: `${Number(year) + 1}-01-01`, label: year };
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function takenNights(stays: Reservation[], from: string, to: string) {
  const taken = new Set<string>();
  for (const stay of stays) {
    let cursor = stay.checkIn < from ? from : stay.checkIn;
    const stop = stay.checkOut < to ? stay.checkOut : to;
    while (cursor < stop) {
      taken.add(cursor);
      cursor = addDays(cursor, 1);
    }
  }
  return taken;
}

export function grossPace(propertyId: GoalHouse, reservations: Reservation[], asOf: string) {
  const window = goalWindow(propertyId, asOf);
  const mine = reservations.filter(
    (stay) => stay.propertyId === propertyId && stay.status !== 'cancelled',
  );
  const booked = mine
    .filter((stay) => stay.status !== 'blocked' && stay.checkIn >= window.start && stay.checkIn < window.end)
    .reduce((sum, stay) => sum + (Number(stay.payout) || 0), 0);
  const paceFrom = asOf > window.start ? asOf : window.start;
  const taken = takenNights(mine, paceFrom, window.end);
  let openNightsLeft = 0;
  if (paceFrom < window.end) {
    let cursor = paceFrom;
    while (cursor < window.end) {
      if (!taken.has(cursor) && (propertyId !== 'river' || cursor >= '2026-11-01')) openNightsLeft += 1;
      cursor = addDays(cursor, 1);
    }
  }
  const target = ANNUAL_GROSS_GOAL[propertyId];
  const stillNeeded = Math.max(0, Math.round(target - booked));
  return {
    target,
    label: window.label,
    booked: Math.round(booked),
    stillNeeded,
    openNightsLeft,
    sellOutHostNightly: stillNeeded > 0 && openNightsLeft > 0 ? Math.round(stillNeeded / openNightsLeft) : null,
  };
}
