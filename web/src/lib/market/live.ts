import { isRealDay } from './dates';
import type { BoardSource, HouseId } from './types';

/**
 * A comp that is a real listing, not a stand-in. It only enters the rate band when it carries the
 * facts the band compares: how many it sleeps and how far it sits.
 */
export type LiveComp = {
  id: string;
  name: string;
  area: string;
  sleeps: number;
  beds: number;
  distanceMi: number;
  rating: number;
  reviews: number;
  guestFavorite: boolean;
};

/** One observed guest ask on one night for one comp. */
export type LiveSnap = {
  compId: string;
  date: string;
  nightlyRate: number;
};

/**
 * The most nights one ask save may cover. A listing usually shows one rate across a run of nights,
 * so a save records a run, and this keeps a paste or a typo from filling the store.
 */
export const MAX_ASK_NIGHTS = 120;


function whole(value: unknown, min: number, max: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  if (rounded < min || rounded > max) return null;
  return rounded;
}

function rate(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  // A guest ask at or under zero is not an ask, and a five-figure night is a data error.
  if (value <= 0 || value > 100_000) return null;
  return Math.round(value);
}

function text(value: unknown, max = 80): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

/**
 * A real comp from the saved comp set. A listing without a sleep count or a distance stays out:
 * the band cannot compare it, and a made-up number would move a rate.
 */
export function toLiveComp(value: unknown): LiveComp | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const id = text(raw.id, 64);
  if (!id) return null;
  const sleeps = whole(raw.sleeps, 1, 60);
  if (sleeps === null) return null;
  const distance = typeof raw.distanceMi === 'number' && Number.isFinite(raw.distanceMi) ? raw.distanceMi : null;
  if (distance === null || distance < 0 || distance > 500) return null;
  const name = text(raw.label ?? raw.name) ?? 'Saved comp';
  return {
    id,
    name,
    area: text(raw.area) ?? 'Nearby',
    sleeps,
    beds: whole(raw.bedrooms ?? raw.beds, 0, 30) ?? 0,
    distanceMi: Math.round(distance * 10) / 10,
    rating: typeof raw.rating === 'number' && raw.rating >= 0 && raw.rating <= 5 ? raw.rating : 0,
    reviews: whole(raw.reviews, 0, 100_000) ?? 0,
    guestFavorite: raw.guestFavorite === true,
  };
}

/** Observed asks. A row with a bad date or no real rate is dropped, not guessed. */
export function toLiveSnaps(values: unknown): LiveSnap[] {
  if (!Array.isArray(values)) return [];
  const out: LiveSnap[] = [];
  for (const value of values) {
    if (!value || typeof value !== 'object') continue;
    const raw = value as Record<string, unknown>;
    const compId = text(raw.compId, 64);
    const date = text(raw.date, 10);
    const nightlyRate = rate(raw.nightlyRate);
    if (!compId || !date || !isRealDay(date) || nightlyRate === null) continue;
    out.push({ compId, date, nightlyRate });
  }
  return out;
}

/** Saved comps from a list. A listing that cannot carry a band stays out. */
export function toLiveComps(values: readonly unknown[]): LiveComp[] {
  const out: LiveComp[] = [];
  for (const value of values) {
    const comp = toLiveComp(value);
    if (comp) out.push(comp);
  }
  return out;
}

export type SnapIndex = Map<string, Map<string, number>>;

/** compId → date → observed ask. A later fetch for the same night replaces the earlier one. */
export function indexSnaps(snaps: readonly LiveSnap[]): SnapIndex {
  const index: SnapIndex = new Map();
  for (const snap of snaps) {
    if (!isRealDay(snap.date) || !(snap.nightlyRate > 0)) continue;
    const byDate = index.get(snap.compId) ?? new Map<string, number>();
    byDate.set(snap.date, snap.nightlyRate);
    index.set(snap.compId, byDate);
  }
  return index;
}

/** The observed ask for one comp on one night. Null means no comp watched that night. */
export function liveAsk(index: SnapIndex, compId: string, iso: string): number | null {
  return index.get(compId)?.get(iso) ?? null;
}

/** How many of these nights a comp actually has a saved ask for. */
export function liveCoverage(
  index: SnapIndex,
  compId: string,
  nights: readonly string[],
): { dates: number; first: string | null; last: string | null } {
  const byDate = index.get(compId);
  if (!byDate) return { dates: 0, first: null, last: null };
  const hits = nights.filter((iso) => byDate.has(iso));
  return {
    dates: hits.length,
    first: hits[0] ?? null,
    last: hits[hits.length - 1] ?? null,
  };
}

/** True when this comp sleeps at least 60% of the house and sits within 10 miles. */
export function liveCompFits(house: HouseId, sleeps: number, distanceMi: number): boolean {
  const ours = house === 'river' ? 25 : house === 'ranch' ? 20 : 12;
  return sleeps * 5 >= ours * 3 && distanceMi <= 10;
}

/** A card line for a saved comp. It names whether the ask is observed, and never invents a rate. */
export function liveCompLine(comp: LiveComp, coverage: number, house: HouseId): string {
  const fits = liveCompFits(house, comp.sleeps, comp.distanceMi);
  const place = `Sleeps ${comp.sleeps}, ${comp.distanceMi} mi.`;
  if (!fits) return `${place} Not used in the rate band.`;
  if (coverage === 0) return `${place} No saved ask yet, so it does not set the band.`;
  return `${place} ${coverage === 1 ? '1 night has a saved ask.' : `${coverage} nights have a saved ask.`}`;
}

export type SnapsResponse = {
  snaps: Array<{ compId: string; date: string; nightlyRate: number }>;
  liveComps: LiveComp[];
  storageReads?: 'ok' | 'paused';
};

/**
 * The saved comps that can carry an ask, the asks they carry, and the nights that were watched.
 * A comp without a sleep count or a distance is left out, so a missing number cannot move a rate.
 */
export function liveCardRows(
  comps: readonly LiveComp[],
  snaps: readonly LiveSnap[],
  nights: readonly string[],
  house: HouseId,
): Array<{ comp: LiveComp; coverage: number; ask: number | null; line: string }> {
  const index = indexSnaps(snaps);
  return comps
    .map((comp) => {
      const cover = liveCoverage(index, comp.id, nights);
      const firstNight = nights.find((iso) => liveAsk(index, comp.id, iso) !== null);
      return {
        comp,
        coverage: cover.dates,
        ask: firstNight ? liveAsk(index, comp.id, firstNight) : null,
        line: liveCompLine(comp, cover.dates, house),
      };
    })
    .sort((a, b) => Number(b.comp.guestFavorite) - Number(a.comp.guestFavorite) || a.comp.distanceMi - b.comp.distanceMi)
    .slice(0, 10);
}

/** A saved comp card and a sample card side by side. Nothing here is called a live listing unless it is saved. */
export function mergedCompCount(sampleCount: number, liveCount: number): string {
  if (liveCount === 0) return `${sampleCount} sample comps.`;
  if (sampleCount === 0) return `${liveCount} saved ${liveCount === 1 ? 'comp' : 'comps'}.`;
  return `${liveCount} saved ${liveCount === 1 ? 'comp' : 'comps'} and ${sampleCount} samples.`;
}

/**
 * Where a night's band came from. Defined in `types` so the board and the row cannot drift.
 *
 * `thin` means a saved ask is present but the band has fewer than three observations, so it is not a
 * market: there is no meaningful percentile to place our rate in. The host's own ask is still shown,
 * because hiding it would be worse, but the board must not call it live.
 */
export type { BoardSource };

/** Where this night's band came from. Any saved ask governs the night outright. */
export function bandSource(liveCount: number): BoardSource {
  return liveCount > 0 ? 'live' : 'sample';
}

/** One sentence for the board. It does not call a stand-in a live listing. */
export function boardSourceLine(source: BoardSource, liveNights: number, liveComps: number): string {
  if (source === 'sample') {
    return 'Every ask in this band is a sample. No saved comp has a real ask for these nights yet.';
  }
  const nights = liveNights === 1 ? '1 night' : `${liveNights} nights`;
  const comps = liveComps === 1 ? '1 saved comp' : `${liveComps} saved comps`;
  if (source === 'thin') {
    // One or two observations is not a band. Saying so is the point: a single ask presented as a
    // median reads as market data when it is one listing.
    return `Only ${comps} ${liveComps === 1 ? 'has' : 'have'} a saved ask on these nights, which is too few to read a band from. The rest of each night still comes from the sample, so the rate holds.`;
  }
  if (source === 'live') {
    return `Every ask in this band comes from ${comps} on ${nights}. A night with no saved ask is left out.`;
  }
  return `Some nights use ${comps}. A night with no saved ask keeps the sample, so this band is mixed.`;
}
