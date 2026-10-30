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

/** Published house notes for the cleaner. A note that names a door code or Wi-Fi is left off. */
export function workOrderNotes(house: HouseId): string[] {
  return houseStay(house).notes
    .filter((note) => !/door\s*code|wi-?fi|password/i.test(`${note.title} ${note.body}`))
    .map((note) => `${note.title}. ${note.body}`);
}

const LEAVING_ES: Record<string, string> = {
  'Start the dishwasher.': 'Enciende el lavavajillas.',
  'Put used towels in the laundry room.': 'Pon las toallas usadas en el cuarto de lavado.',
  'Take kitchen trash to the outside bins.': 'Lleva la basura de la cocina a los botes de afuera.',
  'Turn off lights and the fireplace, close windows.': 'Apaga las luces y la chimenea, y cierra las ventanas.',
  'Lock the door behind you. The lock will reset for the next guests.':
    'Cierra la puerta al salir. La cerradura se reinicia para los siguientes huéspedes.',
};

/** What the guest was asked to do before leaving. This is not the cleaner checklist. */
export function workOrderLeaving(lang: CleanLang): string[] {
  return houseStay('ranch').checkout
    .map((step) => step.trim())
    .filter((step) => step.length > 0 && !/door\s*code|wi-?fi|password/i.test(step))
    .map((step) => (lang === 'es' ? (LEAVING_ES[step] ?? step) : step));
}

/** One brief line. No door code. */
export function guestLeavingLine(): string {
  return 'Before checkout the guest was asked to start the dishwasher, put used towels in the laundry room, take the kitchen trash out, turn off the lights and the fireplace, and lock the door.';
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
