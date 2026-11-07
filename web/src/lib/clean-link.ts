import { houseStay } from './house-stay';
import { isRealDay } from './market/dates';
import type { HouseId } from './market/types';

export type CleanLinkRecord = {
  token: string;
  /** The person or company this link is for. A label only. */
  label: string;
  createdAt: string;
  lastViewedAt?: string;
  views?: number;
};

const TOKEN = /^[a-f0-9]{32}$/;

export function isCleanToken(value: string): boolean {
  return TOKEN.test(value);
}

export function cleanLinkPath(token: string): string {
  return `/clean/${token}`;
}

/** One turnover as the cleaner sees it. No guest name, no door code, no money. */
export type CleanJobView = {
  house: HouseId;
  houseName: string;
  /** Checkout morning, YYYY-MM-DD. */
  checkout: string;
  /** Nights the house sits empty before the next arrival. Null when nothing is booked yet. */
  gapNights: number | null;
  sameDay: boolean;
  /** The steps for this turn, already in plain language. */
  steps: string[];
  /** Where the keys are and where to park, from the published guide. */
  arrive: string;
  rules: string[];
};

const NAME: Record<HouseId, string> = {
  river: 'The River House',
  ranch: 'The Ranch House',
  lindon: 'The Lindon House',
};

function shortDate(iso: string): string {
  if (!isRealDay(iso)) return '';
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    weekday: 'short',
    timeZone: 'UTC',
  });
}

/** The cleaner steps. A same-day turn gets the deadline first. */
export function cleanSteps(sameDay: boolean, lang: 'en' | 'es' = 'en'): string[] {
  if (lang === 'es') {
    const steps = [
      'Quitar y volver a hacer cada cama',
      'Poner la ropa de cama a lavar',
      'Cocina, platos y café',
      'Baños y toallas',
      'Pisos y basura',
      'Tomar una foto de cada cuarto antes de salir',
    ];
    return sameDay ? ['Turno el mismo día. Terminar antes de las 4pm.', ...steps] : steps;
  }
  const steps = [
    'Strip and remake every bed',
    'Start the linens',
    'Kitchen, dishes, and coffee',
    'Bathrooms and towels',
    'Floors and trash',
    'Photo each room before you leave',
  ];
  return sameDay ? ['Same-day turn. Finish before 4pm.', ...steps] : steps;
}

/**
 * One clean job from a saved turnover. The door code and the guest name stay off it: a cleaner
 * gets the house, the day, what to do, and how to get in, not the lock.
 */
export function cleanJobView(input: {
  house: HouseId;
  checkout: string;
  gapNights: number | null;
  lang?: 'en' | 'es';
}): CleanJobView | null {
  if (!isRealDay(input.checkout)) return null;
  const stay = houseStay(input.house);
  const sameDay = input.gapNights === 0;
  // The house notes and the guest's leaving steps, one line each and no repeats.
  const notes = stay.notes.flatMap((note) => note.body.split(/(?<=\.)\s+/));
  const leaving = stay.checkout.flatMap((step) => step.split(/(?<=\.)\s+/));
  const rules = [...new Set([...notes, ...leaving].map((line) => line.trim()))].filter(
    (line) => line.length > 0 && !/\bdoor\s*code\b/i.test(line) && !line.includes('$'),
  );
  return {
    house: input.house,
    houseName: NAME[input.house],
    checkout: input.checkout,
    gapNights: input.gapNights,
    sameDay,
    steps: cleanSteps(sameDay, input.lang ?? 'en'),
    arrive: `${stay.arrival} ${stay.parking}`,
    rules,
  };
}

/** A line for the cleaner's job list. It does not name a guest and does not carry a code. */
export function cleanJobLine(job: CleanJobView): string {
  const when = shortDate(job.checkout);
  if (job.sameDay) return `${when} · ${job.houseName} · same-day turn, finish before 4pm`;
  if (job.gapNights === null) return `${when} · ${job.houseName}`;
  return `${when} · ${job.houseName} · ${job.gapNights === 1 ? '1 night' : `${job.gapNights} nights`} before the next stay`;
}

/** The top of the cleaner page. */
export function cleanPageNote(jobs: readonly CleanJobView[], unread: boolean): string {
  if (unread) {
    return 'Saved bookings could not be read, so this list is not showing anything. Nothing was written over them.';
  }
  if (jobs.length === 0) return 'No turnover in the next two weeks. Nothing was booked or sent.';
  const same = jobs.filter((job) => job.sameDay).length;
  const count = jobs.length === 1 ? '1 turnover' : `${jobs.length} turnovers`;
  const tail = same === 0 ? '' : ` ${same === 1 ? '1 is a same-day turn.' : `${same} are same-day turns.`}`;
  return `${count} in the next two weeks.${tail} The door code stays on the guest phone, not on this page.`;
}

/** The jobs a cleaner sees, oldest first. A broken date stays out rather than sorting oddly. */
export function sortCleanJobs(jobs: readonly CleanJobView[]): CleanJobView[] {
  return [...jobs].sort(
    (a, b) => a.checkout.localeCompare(b.checkout) || a.houseName.localeCompare(b.houseName),
  );
}
