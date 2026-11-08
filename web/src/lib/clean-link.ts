import { houseStay } from './house-stay';
import { stepRows } from './clean-progress';
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
  /**
   * The same steps with the id each one is ticked by. A client must send `id`, not `label` — the route filters
   * against `stepIds` and drops anything else, which is how every tick was silently discarded.
   */
  stepRows: Array<{ id: string; label: string }>;
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
    /*
     * The ids a tick must use, paired with the label the cleaner reads.
     *
     * The payload sent `steps` as plain labels only, while `POST /api/clean/:token` filters whatever it is given
     * against `stepIds(sameDay)` — `window`, `beds`, `linens`, `kitchen`, `baths`, `floors`, `photos`. A client could
     * only ever echo a label, so **every tick was silently dropped**: the POST answered `ok: true`, a progress row
     * was written with an empty `done`, and the box re-rendered unticked. Measured on production — labels produced
     * `done: []`, ids produced `done: ["beds","window"]` on the same route.
     *
     * A tick that reports success and saves nothing is the same defect as a label with nothing behind it, and it is
     * worse on a cleaner's phone, because they have no way to tell that their work did not register.
     */
    stepRows: stepRows(sameDay, input.lang ?? 'en'),
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
export function cleanPageNote(
  jobs: readonly CleanJobView[],
  unread: boolean,
  lang: 'en' | 'es' = 'en',
): string {
  /*
   * The steps already translate, so an English sentence under Spanish tasks reads as a half-finished
   * page to the person who has to use it. Every line a cleaner reads is in their language.
   */
  if (lang === 'es') {
    if (unread) {
      return 'No se pudieron leer las reservas guardadas, así que esta lista no muestra nada. No se escribió nada encima.';
    }
    if (jobs.length === 0) return 'No hay limpieza en las próximas dos semanas. No se reservó ni se envió nada.';
    const sameEs = jobs.filter((job) => job.sameDay).length;
    const countEs = jobs.length === 1 ? '1 limpieza' : `${jobs.length} limpiezas`;
    const tailEs =
      sameEs === 0 ? '' : ` ${sameEs === 1 ? '1 es el mismo día de entrada.' : `${sameEs} son el mismo día de entrada.`}`;
    return `${countEs} en las próximas dos semanas.${tailEs} El código de la puerta queda en el teléfono del huésped, no en esta página.`;
  }
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
