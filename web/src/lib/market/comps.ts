import { benchFor, compsFor, type SampleComp } from './fixtures';
import type { HouseId } from './types';

export type CompChoice = {
  pinned: string[];
  excluded: string[];
};

export const EMPTY_COMP_CHOICE: CompChoice = { pinned: [], excluded: [] };

const HOUSES: HouseId[] = ['river', 'ranch', 'lindon'];

function scoreComp(comp: SampleComp, house: HouseId): number {
  const idealBeds = house === 'river' ? 7 : house === 'ranch' ? 6 : 4;
  const bedGap = Math.abs(comp.beds - idealBeds);
  const favorite = comp.guestFavorite ? 8 : 0;
  const rating = (comp.rating - 4.6) * 40;
  const distance = Math.max(0, 12 - comp.distanceMi);
  return Math.round(rating + favorite + distance - bedGap * 3);
}

/** Primary comps, with pinned names first and a bench comp filling any hole. */
export function chooseComps(house: HouseId, choice: CompChoice): SampleComp[] {
  const primary = compsFor(house);
  const bench = benchFor(house);
  const pool = [...primary, ...bench];
  const excluded = new Set(choice.excluded);
  const pinnedIds = choice.pinned.filter((id) => pool.some((comp) => comp.id === id) && !excluded.has(id));
  const pinned = pinnedIds.map((id) => pool.find((comp) => comp.id === id)!);
  const rest = pool.filter((comp) => !excluded.has(comp.id) && !pinnedIds.includes(comp.id));
  const primaryRest = rest.filter((comp) => primary.some((item) => item.id === comp.id));
  const benchRest = rest
    .filter((comp) => bench.some((item) => item.id === comp.id))
    .sort((a, b) => scoreComp(b, house) - scoreComp(a, house));
  return [...pinned, ...primaryRest, ...benchRest].slice(0, 10);
}

export function emptyCompChoices(): Record<HouseId, CompChoice> {
  return {
    river: { pinned: [], excluded: [] },
    ranch: { pinned: [], excluded: [] },
    lindon: { pinned: [], excluded: [] },
  };
}

export function loadCompChoices(): Record<HouseId, CompChoice> {
  const base = emptyCompChoices();
  if (typeof localStorage === 'undefined') return base;
  try {
    const parsed = JSON.parse(localStorage.getItem('uml-comp-set') || 'null') as Partial<Record<HouseId, CompChoice>> | null;
    if (!parsed) return base;
    for (const house of HOUSES) {
      const row = parsed[house];
      if (!row) continue;
      base[house] = {
        pinned: Array.isArray(row.pinned) ? row.pinned.filter((id) => typeof id === 'string') : [],
        excluded: Array.isArray(row.excluded) ? row.excluded.filter((id) => typeof id === 'string') : [],
      };
    }
  } catch {
    return emptyCompChoices();
  }
  return base;
}

export function saveCompChoices(choices: Record<HouseId, CompChoice>) {
  localStorage.setItem('uml-comp-set', JSON.stringify(choices));
}
