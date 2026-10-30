import { chooseComps } from './comps';
import type { HouseId } from './types';

export const AMENITY_IDS = ['hot-tub', 'river', 'king-suites', 'ev-charger', 'game-room', 'fire-pit', 'pool', 'sauna'] as const;
export type AmenityId = (typeof AMENITY_IDS)[number];

const LABEL: Record<AmenityId, string> = {
  'hot-tub': 'a hot tub',
  river: 'the river',
  'king-suites': 'king suites',
  'ev-charger': 'an EV charger',
  'game-room': 'a game room',
  'fire-pit': 'a fire pit',
  pool: 'a pool',
  sauna: 'a sauna',
};

/** What the published guest guide already says. Sample comps do not add to this list. */
const OURS: Record<HouseId, readonly AmenityId[]> = {
  river: ['river', 'king-suites'],
  ranch: ['hot-tub'],
  lindon: [],
};

/** Stand-in amenity lists. These are not live listings. */
const COMP_AMENITIES: Record<string, readonly AmenityId[]> = {
  'river-1': ['hot-tub', 'ev-charger', 'fire-pit'],
  'river-2': ['hot-tub', 'ev-charger', 'river'],
  'river-3': ['ev-charger', 'king-suites', 'game-room', 'pool'],
  'river-4': ['hot-tub', 'ev-charger', 'sauna'],
  'river-5': ['ev-charger', 'fire-pit', 'game-room'],
  'river-6': ['hot-tub', 'fire-pit'],
  'river-7': ['ev-charger', 'sauna', 'river'],
  'river-8': ['ev-charger', 'game-room', 'fire-pit'],
  'river-9': ['ev-charger', 'hot-tub', 'pool'],
  'river-10': ['ev-charger', 'fire-pit', 'king-suites'],
  'river-b1': ['fire-pit', 'game-room'],
  'river-b2': ['hot-tub', 'ev-charger', 'sauna'],
  'ranch-1': ['hot-tub', 'ev-charger', 'game-room'],
  'ranch-2': ['hot-tub', 'fire-pit'],
  'ranch-3': ['hot-tub', 'ev-charger', 'pool'],
  'ranch-4': ['ev-charger', 'game-room'],
  'ranch-5': ['hot-tub', 'fire-pit', 'game-room'],
  'ranch-6': ['hot-tub'],
  'ranch-7': ['hot-tub', 'ev-charger', 'sauna'],
  'ranch-8': ['fire-pit'],
  'ranch-9': ['hot-tub', 'pool'],
  'ranch-10': ['hot-tub', 'ev-charger'],
  'ranch-b1': ['hot-tub', 'ev-charger'],
  'ranch-b2': ['hot-tub', 'game-room'],
  'lindon-1': ['hot-tub'],
  'lindon-2': [],
  'lindon-3': ['ev-charger'],
  'lindon-4': ['game-room'],
  'lindon-5': ['hot-tub', 'fire-pit'],
  'lindon-6': [],
  'lindon-7': ['ev-charger', 'game-room'],
  'lindon-8': ['fire-pit'],
  'lindon-9': [],
  'lindon-10': ['pool'],
  'lindon-b1': ['hot-tub'],
  'lindon-b2': [],
};

export type AmenityRow = {
  id: AmenityId;
  label: string;
  ours: boolean;
  listed: number;
  compared: number;
  line: string;
};

export function compAmenities(id: string): readonly AmenityId[] {
  return COMP_AMENITIES[id] ?? [];
}

export function compAmenityLine(id: string): string {
  const labels = compAmenities(id).map((amenity) => LABEL[amenity]);
  return labels.length > 0 ? `Sample list: ${labels.join(', ')}.` : 'Sample list: none.';
}

/** How the sample set compares with our guide. Hiding a comp changes the count. Nothing is posted. */
export function amenityGaps(house: HouseId, comps: readonly { id: string }[]): AmenityRow[] {
  const compared = comps.length;
  if (compared === 0) return [];
  const ours = new Set(OURS[house]);
  return AMENITY_IDS.map((id) => {
    const listed = comps.filter((comp) => compAmenities(comp.id).includes(id)).length;
    const we = ours.has(id);
    return { id, label: LABEL[id], ours: we, listed, compared, line: amenityLine(we, LABEL[id], listed, compared) };
  })
    .filter((row) => row.ours || row.listed > 0)
    .sort((a, b) => Number(a.ours) - Number(b.ours) || b.listed - a.listed || a.label.localeCompare(b.label));
}

export function amenityGapsForChoice(house: HouseId, excluded: readonly string[] = []): AmenityRow[] {
  return amenityGaps(house, chooseComps(house, { pinned: [], excluded: [...excluded] }));
}

function amenityLine(ours: boolean, label: string, listed: number, compared: number): string {
  const count = `${listed} of ${compared}`;
  if (ours && listed === 0) return `We list ${label}. None of these sample comps do.`;
  if (ours) return `We list ${label}. ${count} sample comps do too.`;
  return `${count} sample comps list ${label}. Our guide does not.`;
}
