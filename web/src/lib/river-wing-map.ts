import type { RiverUnitId } from './river-units';
import { RIVER_UNIT_DETAIL } from './river-units';

/** Draft asks from the unpublished listings, used only when a live nightly has not been read. */
export const RIVER_DRAFT_NIGHTLY: Record<RiverUnitId, number> = {
  'main-lodge': 745,
  'recreation-wing': 535,
  'garage-suite': 265,
};

export type WingQuoteInput = {
  id: RiverUnitId;
  nightly: number | null;
  cleaning: number | null;
  taken: readonly string[];
};

export type WingQuote = {
  units: RiverUnitId[];
  whole: boolean;
  sleeps: number;
  nights: number;
  lodging: number | null;
  cleaning: number | null;
  total: number | null;
  unavailable: RiverUnitId[];
  draft: boolean;
};

export function nightsBetween(checkIn: string, checkOut: string): string[] {
  if (!checkIn || !checkOut || checkOut <= checkIn) return [];
  const out: string[] = [];
  const cursor = new Date(`${checkIn}T12:00:00Z`);
  const end = new Date(`${checkOut}T12:00:00Z`);
  while (cursor < end && out.length < 60) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

export function quoteWings(selected: readonly RiverUnitId[], wings: readonly WingQuoteInput[], checkIn: string, checkOut: string): WingQuote {
  const nights = nightsBetween(checkIn, checkOut);
  const chosen = RIVER_UNIT_DETAIL.map((unit) => unit.id).filter((id) => selected.includes(id));
  const unavailable = chosen.filter((id) => {
    const wing = wings.find((row) => row.id === id);
    if (!wing || nights.length === 0) return false;
    const taken = new Set(wing.taken);
    return nights.some((night) => taken.has(night));
  });
  const sleeps = RIVER_UNIT_DETAIL.filter((unit) => chosen.includes(unit.id)).reduce((sum, unit) => sum + unit.sleeps, 0);
  let lodging = 0;
  let cleaning = 0;
  let draft = false;
  let priced = chosen.length > 0 && unavailable.length === 0 && nights.length > 0;
  for (const id of chosen) {
    const wing = wings.find((row) => row.id === id);
    const nightly = wing?.nightly && wing.nightly > 0 ? wing.nightly : RIVER_DRAFT_NIGHTLY[id];
    if (!wing?.nightly) draft = true;
    const clean = wing?.cleaning ?? 0;
    if (priced) {
      lodging += nightly * nights.length;
      cleaning += clean;
    }
  }
  if (!priced) lodging = 0;
  return {
    units: chosen,
    whole: chosen.length === 3,
    sleeps,
    nights: nights.length,
    lodging: priced ? lodging : null,
    cleaning: priced ? cleaning : null,
    total: priced ? lodging + cleaning : null,
    unavailable,
    draft,
  };
}
