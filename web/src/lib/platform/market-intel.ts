/**
 * Comp intelligence that runs without an AirROI key.
 * Live pulls stay planned. The fixture path is what the desk can use today, and it says so.
 */

import { median, percentileValue } from '../market/stats';

export type CompCandidate = {
  id: string;
  house: 'ranch' | 'lindon' | 'river';
  name: string;
  sleeps: number;
  rating: number;
  reviews: number;
  guestFavorite: boolean;
  distanceMi: number;
  nightly: number;
  source: 'fixture' | 'airroi' | 'apify';
};

export const DAILY_COMP_BUDGET_CENTS = 600;

const FIXTURES: CompCandidate[] = [
  { id: 'fx-river-1', house: 'river', name: 'Fixture canyon lodge', sleeps: 18, rating: 4.9, reviews: 40, guestFavorite: true, distanceMi: 3, nightly: 1800, source: 'fixture' },
  { id: 'fx-river-2', house: 'river', name: 'Fixture river bench', sleeps: 16, rating: 4.8, reviews: 22, guestFavorite: false, distanceMi: 5, nightly: 1600, source: 'fixture' },
  { id: 'fx-ranch-1', house: 'ranch', name: 'Fixture Lindon group home', sleeps: 16, rating: 4.85, reviews: 30, guestFavorite: true, distanceMi: 1, nightly: 540, source: 'fixture' },
  { id: 'fx-lindon-1', house: 'lindon', name: 'Fixture Lindon house', sleeps: 12, rating: 4.8, reviews: 18, guestFavorite: false, distanceMi: 1, nightly: 420, source: 'fixture' },
];

export type CompLoad = {
  source: 'fixture' | 'airroi';
  comps: CompCandidate[];
  spentCents: number;
  reason: string;
};

/** No key, or a call that would pass the daily cap, stays on the fixture and spends nothing. */
export function loadComps(input: {
  house: CompCandidate['house'];
  apiKey?: string;
  spentCents?: number;
  quoteCents?: number;
}): CompLoad {
  const spent = input.spentCents ?? 0;
  const quote = input.quoteCents ?? 0;
  const houseRows = FIXTURES.filter((row) => row.house === input.house);
  if (!input.apiKey) {
    return { source: 'fixture', comps: houseRows, spentCents: 0, reason: 'No AirROI key. These comps are fixtures, not a live market.' };
  }
  if (spent + quote > DAILY_COMP_BUDGET_CENTS) {
    return {
      source: 'fixture',
      comps: houseRows,
      spentCents: 0,
      reason: 'This pull would pass the daily comp budget, so it was not made.',
    };
  }
  return {
    source: 'fixture',
    comps: houseRows,
    spentCents: 0,
    reason: 'A key is present but no AirROI client is connected. The fixture is still what this returns.',
  };
}

export function scoreComp(comp: CompCandidate, houseSleeps: number): number {
  const sleeps = 1 - Math.min(1, Math.abs(comp.sleeps - houseSleeps) / Math.max(1, houseSleeps));
  const rating = Math.max(0, Math.min(1, comp.rating / 5));
  const distance = 1 - Math.min(1, comp.distanceMi / 30);
  const favorite = comp.guestFavorite ? 0.1 : 0;
  return Math.round((sleeps * 0.45 + rating * 0.25 + distance * 0.2 + favorite) * 1000) / 1000;
}

/** ISO week, so a re-pick is stable inside a week and changes on Monday. */
export function weekKey(isoDate: string): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return 'unknown';
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function pickTop(
  comps: CompCandidate[],
  input: { houseSleeps: number; pinned?: string[]; excluded?: string[]; limit?: number },
): CompCandidate[] {
  const pinned = new Set(input.pinned ?? []);
  const excluded = new Set(input.excluded ?? []);
  const limit = input.limit ?? 10;
  const open = comps.filter((comp) => !excluded.has(comp.id));
  const ranked = [...open].sort((a, b) => {
    const pin = Number(pinned.has(b.id)) - Number(pinned.has(a.id));
    if (pin !== 0) return pin;
    return scoreComp(b, input.houseSleeps) - scoreComp(a, input.houseSleeps);
  });
  return ranked.slice(0, limit);
}

export function rateBand(rates: number[]): { n: number; p25: number; median: number; p75: number } {
  const clean = rates.filter((rate) => Number.isFinite(rate) && rate > 0);
  return {
    n: clean.length,
    p25: Math.round(percentileValue(clean, 25)),
    median: Math.round(median(clean)),
    p75: Math.round(percentileValue(clean, 75)),
  };
}

/** Share of nights booked in each window. The array is tonight first. */
export function paceWindows(booked: boolean[]): { d30: number; d60: number; d90: number } {
  const share = (days: number) => {
    const slice = booked.slice(0, days);
    if (slice.length === 0) return 0;
    return Math.round((slice.filter(Boolean).length / slice.length) * 1000) / 1000;
  };
  return { d30: share(30), d60: share(60), d90: share(90) };
}

export function trailingRevPar(months: { adr: number; occupancy: number }[]): { adr: number; occupancy: number; revpar: number } {
  if (months.length === 0) return { adr: 0, occupancy: 0, revpar: 0 };
  const adr = months.reduce((sum, month) => sum + month.adr, 0) / months.length;
  const occupancy = months.reduce((sum, month) => sum + month.occupancy, 0) / months.length;
  return {
    adr: Math.round(adr),
    occupancy: Math.round(occupancy * 1000) / 1000,
    revpar: Math.round(adr * occupancy),
  };
}

/** Seeded forecast. Each open night books with `probability` and adds its rate. It does not change a price. */
export function forecastGoal(input: {
  nights: { rate: number; probability: number }[];
  goalRemaining: number;
  draws?: number;
  seed?: number;
}): { p10: number; p50: number; p90: number; chanceOfGoal: number; draws: number } {
  const draws = input.draws ?? 200;
  const random = mulberry(input.seed ?? 1);
  const totals: number[] = [];
  for (let draw = 0; draw < draws; draw += 1) {
    let total = 0;
    for (const night of input.nights) {
      if (random() < night.probability) total += night.rate;
    }
    totals.push(total);
  }
  totals.sort((a, b) => a - b);
  const at = (p: number) => totals[Math.min(totals.length - 1, Math.floor(p * (totals.length - 1)))] ?? 0;
  const hits = totals.filter((total) => total >= input.goalRemaining).length;
  return {
    p10: at(0.1),
    p50: at(0.5),
    p90: at(0.9),
    chanceOfGoal: draws === 0 ? 0 : Math.round((hits / draws) * 1000) / 1000,
    draws,
  };
}

function mulberry(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Opportunity = {
  id: string;
  title: string;
  detail: string;
  liftEstimate: number | null;
  apply: false;
};

/** Amenities most comps list and we do not. The lift is an estimate, and nothing is applied. */
export function opportunities(input: { ours: string[]; comps: string[][] }): Opportunity[] {
  const ours = new Set(input.ours.map((item) => item.toLowerCase()));
  const counts = new Map<string, number>();
  for (const list of input.comps) {
    for (const item of new Set(list.map((name) => name.toLowerCase()))) {
      counts.set(item, (counts.get(item) ?? 0) + 1);
    }
  }
  const rows: Opportunity[] = [];
  for (const [name, count] of counts) {
    if (ours.has(name)) continue;
    if (count < Math.ceil(input.comps.length * 0.6)) continue;
    rows.push({
      id: `amenity-${name}`,
      title: `Comps list ${name}`,
      detail: `${count} of ${input.comps.length} comps list ${name}. This is an estimate, not a measured lift, and nothing was posted.`,
      liftEstimate: null,
      apply: false,
    });
  }
  return rows;
}
