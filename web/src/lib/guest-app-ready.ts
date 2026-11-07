import type { HouseId } from './market/types';

/**
 * Whether a guest app is ready to turn on. The switch in the editor can turn a house app live, and a
 * live app with nothing in it shows a guest a nearly blank page. This is the readiness check the
 * switch asks for before it says yes.
 */
export type GuideFacts = {
  headline?: string;
  address?: string;
  arrival?: string;
  parking?: string;
  houseRules?: string;
  checkout?: string;
  checkInTime?: string;
  checkOutTime?: string;
  wifiName?: string;
  doorCode?: string;
  sections?: ReadonlyArray<{ title?: string; body?: string }>;
  places?: ReadonlyArray<{ name?: string; note?: string }>;
};

export type GuideReadiness = {
  ready: boolean;
  /** The reasons it is not ready, in the order a host should fix them. */
  missing: string[];
  /** A sentence for the editor. It does not threaten; it says what a guest would see. */
  line: string;
};

const REQUIRED: Array<{ key: keyof GuideFacts; label: string }> = [
  { key: 'headline', label: 'a headline' },
  { key: 'address', label: 'the street address' },
  { key: 'arrival', label: 'how to arrive' },
  { key: 'parking', label: 'where to park' },
  { key: 'checkout', label: 'the checkout steps' },
];

function filled(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * What a guest would find. A house needs the facts every guest asks for, at least one photo-free
 * section of house notes, and at least three nearby places to be useful.
 */
export function guideReadiness(guide: GuideFacts | null | undefined): GuideReadiness {
  if (!guide) {
    return { ready: false, missing: ['the guide has not loaded'], line: 'The guide has not loaded yet, so it cannot go on.' };
  }
  const missing = REQUIRED.filter((row) => !filled(guide[row.key])).map((row) => row.label);
  const sections = (guide.sections ?? []).filter((section) => filled(section.title) && filled(section.body));
  if (sections.length === 0) missing.push('at least one house note');
  const places = (guide.places ?? []).filter((place) => filled(place.name) && filled(place.note));
  if (places.length < 3) missing.push('at least three nearby places');
  const ready = missing.length === 0;
  const line = ready
    ? 'Ready for guests. The stay page has the address, how to arrive, where to park, the house notes, the nearby places, and the checkout steps.'
    : `A guest would see a thin page. Add ${listPhrase(missing)} before turning this on.`;
  return { ready, missing, line };
}

function listPhrase(items: readonly string[]): string {
  if (items.length === 1) return items[0]!;
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

/** A refusal for the switch. Null means the switch may turn the house on. */
export function enableHold(guide: GuideFacts | null | undefined): string | null {
  const readiness = guideReadiness(guide);
  if (readiness.ready) return null;
  return `${readiness.line} Turning it on now would show a guest a nearly blank page. It stays off.`;
}

/** What the editor shows beside the switch, on or off. */
export function switchLine(guide: GuideFacts | null | undefined, enabled: boolean): string {
  const readiness = guideReadiness(guide);
  if (!enabled) {
    return readiness.ready
      ? 'The app is off. It has enough in it to turn on when you are ready.'
      : readiness.line;
  }
  return readiness.ready
    ? 'The app is on and guests can open their stay page.'
    : `${readiness.line} It is on, so a guest can see the thin page until this is filled in.`;
}

/** How much of a guide is done, for a progress line that does not overstate it. */
export function guideFill(guide: GuideFacts | null | undefined): { done: number; total: number } {
  if (!guide) return { done: 0, total: REQUIRED.length + 2 };
  const done = REQUIRED.filter((row) => filled(guide[row.key])).length;
  const sections = (guide.sections ?? []).filter((section) => filled(section.title) && filled(section.body)).length > 0 ? 1 : 0;
  const places = (guide.places ?? []).filter((place) => filled(place.name) && filled(place.note)).length >= 3 ? 1 : 0;
  return { done: done + sections + places, total: REQUIRED.length + 2 };
}

/** A line for the guests page listing which houses are ready. No door code is read here. */
export function readinessLine(houses: ReadonlyArray<{ id: HouseId; name: string; guide: GuideFacts | null; enabled: boolean }>): string {
  if (houses.length === 0) return 'No house to check.';
  const off = houses.filter((house) => !house.enabled);
  const thin = houses.filter((house) => !guideReadiness(house.guide).ready);
  if (houses.every((house) => house.enabled && guideReadiness(house.guide).ready)) {
    return 'Every guest app is on and has enough in it for a guest.';
  }
  const parts: string[] = [];
  if (off.length > 0) parts.push(off.length === 1 ? `${off[0]!.name} is off` : `${off.length} are off`);
  if (thin.length > 0) parts.push(thin.length === 1 ? `${thin[0]!.name} is thin` : `${thin.length} are thin`);
  return `${parts.join(' and ')}. A guest on a thin page sees very little.`;
}
