import { PROPERTIES, type Reservation } from './api';
import { houseStay } from './house-stay';
import type { HouseId } from './luxury';
import { buildTurnovers, type Turnover } from './today';

export type CleanStep = {
  id: string;
  label: string;
};

export type CleanLang = 'en' | 'es';

const COPY: Record<CleanLang, Record<string, string>> = {
  en: {
    beds: 'Strip and remake every bed',
    linens: 'Start the linens',
    kitchen: 'Kitchen, dishes, and coffee',
    baths: 'Bathrooms and towels',
    floors: 'Floors and trash',
    photos: 'Photo each room before you leave',
    window: 'Same-day turn. Finish before 4pm.',
  },
  es: {
    beds: 'Quita y tiende cada cama',
    linens: 'Empieza la ropa de cama',
    kitchen: 'Cocina, platos y café',
    baths: 'Baños y toallas',
    floors: 'Pisos y basura',
    photos: 'Foto de cada cuarto antes de irte',
    window: 'Salida y llegada el mismo día. Termina antes de las 4pm.',
  },
};

export function cleanLabel(id: string, lang: CleanLang): string {
  return COPY[lang][id] ?? id;
}

/** Checkout and arrival times from the published house. A same-day turn names both. */
export function workOrderWhen(house: HouseId, sameDay: boolean, lang: CleanLang): string {
  const stay = houseStay(house);
  if (lang === 'es') {
    return sameDay
      ? `Salida a las ${stay.checkOut}. El siguiente huésped llega a las ${stay.checkIn}.`
      : `Salida a las ${stay.checkOut}.`;
  }
  return sameDay
    ? `Checkout at ${stay.checkOut}. The next guest arrives at ${stay.checkIn}.`
    : `Checkout at ${stay.checkOut}.`;
}

/** Where to clean. The door code and Wi-Fi stay off the work order. */
export function workOrderPlace(house: HouseId, lang: CleanLang): string {
  const stay = houseStay(house);
  const address = PROPERTIES[house]?.address ?? '';
  return lang === 'es' ? `Dirección: ${address}. ${stay.parking}` : `${address}. ${stay.parking}`;
}

/** The photo line counts only after a room photo is attached and the box is checked. */
export function stepDone(stepId: string, checked: boolean, photoCount: number): boolean {
  if (stepId === 'photos') return checked && photoCount > 0;
  return checked;
}

export function jobDoneCount(
  steps: ReadonlyArray<{ id: string }>,
  checks: Record<string, boolean>,
  jobId: string,
  photoCount: number,
): number {
  return steps.filter((step) => stepDone(step.id, Boolean(checks[`${jobId}:${step.id}`]), photoCount)).length;
}

export type CleanJob = Turnover & {
  priority: boolean;
  steps: CleanStep[];
};

const STEPS: CleanStep[] = [
  { id: 'beds', label: 'Strip and remake every bed' },
  { id: 'linens', label: 'Start the linens' },
  { id: 'kitchen', label: 'Kitchen, dishes, and coffee' },
  { id: 'baths', label: 'Bathrooms and towels' },
  { id: 'floors', label: 'Floors and trash' },
  { id: 'photos', label: 'Photo each room before you leave' },
];

const SAME_DAY: CleanStep = { id: 'window', label: 'Same-day turn. Finish before 4pm.' };

export function cleanJobs(reservations: Reservation[], asOf: string, horizonDays = 14): CleanJob[] {
  return buildTurnovers(reservations, asOf, horizonDays).map((turn) => {
    const priority = turn.gapNights === 0;
    return {
      ...turn,
      priority,
      steps: priority ? [SAME_DAY, ...STEPS] : STEPS,
    };
  });
}

export type { HouseId };
