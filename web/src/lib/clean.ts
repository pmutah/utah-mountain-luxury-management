import { PROPERTIES, type Reservation } from './api';
import { guestArrivalLine } from './arrival';
import { guestDepartureLine, hostLaterLeavePhrase } from './departure';
import { houseRules } from './house-rules';
import { earlyStayOpen, hostEarlyPhrase, houseStay, nearbyGroups, STAY_CHECKOUT } from './house-stay';
import { checkoutNightIsFree } from './journey';
import { stayPrepPhrase } from './upsells';
import type { HouseId } from './luxury';
import { addDays } from './market/dates';
import { nextStayEventLine, stayEvents } from './market/events';
import { agreementTopicLine } from './stay-agreement';
import { denverHour } from './stay-rhythm';
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

function longDate(iso: string, lang: CleanLang): string {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(lang === 'es' ? 'es-US' : 'en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** When the next stay starts, and when its door code opens. The code stays off the sentence. */
export function workOrderNext(nextCheckIn: string | null, gapNights: number | null, lang: CleanLang): string {
  if (!nextCheckIn || gapNights === null || !/^\d{4}-\d{2}-\d{2}$/.test(nextCheckIn)) {
    return lang === 'es'
      ? 'No hay otra estancia en el calendario. El código de la puerta no está en esta lista.'
      : 'No next stay is on the calendar. The door code stays off this list.';
  }
  const arrive = longDate(nextCheckIn, lang);
  const opens = longDate(addDays(nextCheckIn, -1), lang);
  return lang === 'es'
    ? `La siguiente estancia empieza el ${arrive}. El código de la puerta se abre el ${opens}. El código no está en esta lista.`
    : `The next stay starts ${arrive}. The door code opens ${opens}. The code stays off this list.`;
}

function includingChildren(children: number | null | undefined, lang: CleanLang, count?: number | null): string {
  if (children === null || children === undefined || !Number.isInteger(children) || children < 1 || children > 30) return '';
  if (count !== null && count !== undefined && Number.isInteger(count) && count >= 1 && children > count) return '';
  if (count !== null && count !== undefined && Number.isInteger(count) && count >= 1 && children === count) return '';
  if (lang === 'es') return children === 1 ? ', incluyendo 1 niño' : `, incluyendo ${children} niños`;
  return children === 1 ? ', including 1 child' : `, including ${children} children`;
}

function childrenOnly(count: number | null, children: number | null | undefined): boolean {
  return (
    count !== null &&
    Number.isInteger(count) &&
    count >= 1 &&
    children !== null &&
    children !== undefined &&
    Number.isInteger(children) &&
    children === count
  );
}

/** How many people the next stay is for. Names stay off the sentence. */
export function workOrderParty(count: number | null, lang: CleanLang, children?: number | null): string {
  if (childrenOnly(count, children)) {
    return lang === 'es'
      ? 'La siguiente estancia nombra solo niños. Una estancia necesita un adulto. Los nombres no están en esta lista.'
      : 'The next stay names only children. A stay needs an adult. Names stay off this list.';
  }
  const kids = includingChildren(children, lang, count);
  if (count === null || !Number.isInteger(count) || count < 1) {
    if (kids) {
      return lang === 'es'
        ? `La siguiente estancia nombra ${children === 1 ? '1 niño' : `${children} niños`} y no dice cuántos huéspedes. Los nombres no están en esta lista.`
        : `The next stay names ${children === 1 ? '1 child' : `${children} children`} and does not say how many guests. Names stay off this list.`;
    }
    return lang === 'es'
      ? 'La siguiente estancia no dice cuántos huéspedes. Los nombres no están en esta lista.'
      : 'The next stay does not say how many guests. Names stay off this list.';
  }
  if (lang === 'es') {
    return `La siguiente estancia es para ${count} ${count === 1 ? 'huésped' : 'huéspedes'}${kids}. Los nombres no están en esta lista.`;
  }
  return `The next stay is for ${count === 1 ? '1 guest' : `${count} guests`}${kids}. Names stay off this list.`;
}

function arrivalInSpanish(line: string): string {
  const around = line.match(/^Arrival around (.+)\.$/);
  if (around) return `Llegada alrededor de las ${around[1]}.`;
  const between = line.match(/^Arrival between (.+) and (.+?)\.( Quiet hours still apply\.)?$/);
  if (between) {
    const quiet = between[3] ? ' Las horas de silencio siguen aplicando.' : '';
    return `Llegada entre las ${between[1]} y las ${between[2]}.${quiet}`;
  }
  const after = line.match(/^Arrival after (.+)\. Quiet hours still apply\.$/);
  if (after) return `Llegada después de las ${after[1]}. Las horas de silencio siguen aplicando.`;
  return line;
}

/** When the next stay said they would arrive. A phone or other typed window stays off the sentence. */
export function workOrderArrival(window: string | null | undefined, lang: CleanLang): string {
  const line = guestArrivalLine(window);
  if (!line) {
    return lang === 'es'
      ? 'La siguiente estancia no dice a qué hora llega. Los nombres no están en esta lista.'
      : 'The next stay does not name an arrival time. Names stay off this list.';
  }
  const named = lang === 'es' ? arrivalInSpanish(line) : line;
  return lang === 'es'
    ? `La siguiente estancia dice la hora de llegada. ${named} Los nombres no están en esta lista.`
    : `The next stay names an arrival. ${named} Names stay off this list.`;
}

const DEPARTURE_ES: Record<string, string> = {
  'Leave at 11:00 AM.': 'Salida a las 11:00 AM.',
  'Leave at 2:00 PM. Nothing is charged yet. A same-day arrival still starts at 4:00 PM.':
    'Salida a las 2:00 PM. Todavía no se cobra nada. Una llegada el mismo día sigue siendo a las 4:00 PM.',
};

/** When this checkout said they would leave. A phone or other typed time stays off the sentence. */
export function workOrderDeparture(window: string | null | undefined, lang: CleanLang): string {
  const line = guestDepartureLine(window);
  if (!line) {
    return lang === 'es'
      ? 'Esta salida no dice a qué hora se van. Los nombres no están en esta lista.'
      : 'This checkout does not name a departure time. Names stay off this list.';
  }
  const named = lang === 'es' ? (DEPARTURE_ES[line] ?? line) : line;
  return lang === 'es'
    ? `Esta salida dice la hora de partida. ${named} Los nombres no están en esta lista.`
    : `This checkout names a departure. ${named} Names stay off this list.`;
}

function shortWhen(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** Checkouts in the next two weeks, with the 1:00 PM and 2:00 PM requests. Names stay off the sentence. */
export function serviceBrief(
  stays: readonly { id?: string; propertyId: string; checkIn: string; checkOut: string; status?: string }[],
  taken: Readonly<Record<string, readonly string[]>>,
  asOf: string,
): string {
  const tail = 'Names stay off this line.';
  const turns = buildTurnovers(
    stays.map((stay) => ({
      id: stay.id || `${stay.propertyId}-${stay.checkOut}`,
      propertyId: stay.propertyId,
      checkIn: stay.checkIn,
      checkOut: stay.checkOut,
      status: stay.status,
      guestName: '',
      payout: 0,
      source: '',
    })),
    asOf,
    14,
  );
  if (turns.length === 0) return `No checkouts in the next two weeks. ${tail}`;
  const shown = turns.slice(0, 4).map((turn) => {
    const nights = taken[turn.house] ?? [];
    const leave = hostLaterLeavePhrase(checkoutNightIsFree(turn.checkout, nights));
    const early = turn.nextCheckIn ? ` ${hostEarlyPhrase(earlyStayOpen(turn.nextCheckIn, nights, asOf))}` : '';
    const prep = turn.nextCheckIn ? ` ${stayPrepPhrase(turn.house, turn.nextCheckIn, asOf, 'next')}` : '';
    return `${turn.houseName} ${shortWhen(turn.checkout)}: ${leave}${early}${prep}`;
  });
  const more = turns.length - shown.length;
  return `Next checkouts: ${shown.join(' ')}${more > 0 ? ` ${more} more.` : ''} ${tail}`;
}

/** Ranch hot tub or River groceries for the next stay. Names stay off the sentence. */
export function workOrderPrep(house: HouseId, checkIn: string, asOf: string, lang: CleanLang): string {
  const line = stayPrepPhrase(house, checkIn, asOf, 'next');
  if (!line) return '';
  if (lang === 'es') {
    const item = house === 'ranch' ? 'el jacuzzi' : 'una entrega de víveres';
    return `La siguiente estancia puede pedir ${item}. Todavía no se cobra nada. Los nombres no están en esta lista.`;
  }
  return `${line} Names stay off this list.`;
}

/** The next stay covers a named event. Names and prices stay off the sentence. */
export function workOrderEvent(checkIn: string | null, checkOut: string | null, lang: CleanLang): string {
  if (!checkIn || !checkOut) return '';
  const line = nextStayEventLine(checkIn, checkOut);
  if (!line) return '';
  if (lang === 'es') {
    const names = stayEvents(checkIn, checkOut).map((event) => event.name);
    const list = names.length === 1 ? names[0]! : `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
    return `La siguiente estancia cubre ${list}. No se cobra nada extra. Los nombres no están en esta lista.`;
  }
  return `${line} Names stay off this list.`;
}

/** Whether the next stay can ask to arrive at 1:00 PM. Names stay off the sentence. */
export function workOrderEarly(open: boolean, lang: CleanLang): string {
  if (lang === 'es') {
    return open
      ? 'Llegar a la 1:00 PM es una solicitud. Todavía no se cobra nada. El código de la puerta sigue abriéndose el día anterior. Los nombres no están en esta lista.'
      : 'Una llegada temprana no está abierta para la siguiente estancia. Los nombres no están en esta lista.';
  }
  return `${hostEarlyPhrase(open)} Names stay off this list.`;
}

/** Whether this checkout morning can take a 2:00 PM request. Names stay off the sentence. */
export function workOrderLaterLeave(open: boolean, lang: CleanLang): string {
  const line = hostLaterLeavePhrase(open);
  if (lang === 'es') {
    return open
      ? 'Salir a las 2:00 PM es una solicitud. Todavía no se cobra nada. Una llegada el mismo día sigue siendo a las 4:00 PM. Los nombres no están en esta lista.'
      : 'Una salida a las 2:00 PM no está abierta para esta limpieza. Los nombres no están en esta lista.';
  }
  return `${line} Names stay off this list.`;
}

/** How many people are checking out. Names stay off the sentence. */
export function workOrderCheckoutParty(count: number | null, lang: CleanLang, children?: number | null): string {
  if (childrenOnly(count, children)) {
    return lang === 'es'
      ? 'Esta salida nombra solo niños. Una estancia necesita un adulto. Los nombres no están en esta lista.'
      : 'This checkout names only children. A stay needs an adult. Names stay off this list.';
  }
  const kids = includingChildren(children, lang, count);
  if (count === null || !Number.isInteger(count) || count < 1) {
    if (kids) {
      return lang === 'es'
        ? `Esta salida nombra ${children === 1 ? '1 niño' : `${children} niños`} y no dice cuántos huéspedes. Los nombres no están en esta lista.`
        : `This checkout names ${children === 1 ? '1 child' : `${children} children`} and does not say how many guests. Names stay off this list.`;
    }
    return lang === 'es'
      ? 'Esta salida no dice cuántos huéspedes. Los nombres no están en esta lista.'
      : 'This checkout does not say how many guests. Names stay off this list.';
  }
  if (lang === 'es') {
    return `Esta salida fue de ${count} ${count === 1 ? 'huésped' : 'huéspedes'}${kids}. Los nombres no están en esta lista.`;
  }
  return `This checkout was ${count === 1 ? '1 guest' : `${count} guests`}${kids}. Names stay off this list.`;
}

/** Where to clean. The door code and Wi-Fi stay off the work order. */
export function workOrderPlace(house: HouseId, lang: CleanLang): string {
  const stay = houseStay(house);
  const address = PROPERTIES[house]?.address ?? '';
  return lang === 'es' ? `Dirección: ${address}. ${stay.parking}` : `${address}. ${stay.parking}`;
}

/** A map for the street address. The query is the address only. */
export function workOrderMap(house: HouseId): string {
  const address = PROPERTIES[house]?.address ?? '';
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

const ESSENTIALS_ES: Record<string, string> = {
  'Winter driving. AWD or 4WD with good tires from November to April. The canyon road can ice up at night.':
    'Conducción en invierno. AWD o 4WD con buenas llantas de noviembre a abril. El camino del cañón puede congelarse de noche.',
  'Groceries. Stock up before you drive up the canyon. There is no grocery store at Vivian Park.':
    'Víveres. Abastécete antes de subir el cañón. No hay tienda en Vivian Park.',
  'Most local restaurants close on Sundays. Plan Sunday meals ahead or cook at the house.':
    'La mayoría de los restaurantes locales cierran los domingos. Planea las comidas del domingo o cocina en la casa.',
};

/** Drive notes from the published guide. These are not cleaner checklist steps. */
export function workOrderEssentials(house: HouseId, lang: CleanLang = 'en'): string[] {
  const group = nearbyGroups(houseStay(house).nearby).find((item) => item.kind === 'essentials');
  return (group?.places ?? [])
    .filter((place) => !/door\s*code|wi-?fi|password/i.test(`${place.name} ${place.note}`))
    .map((place) => {
      const line = `${place.name}. ${place.note}`;
      return lang === 'es' ? (ESSENTIALS_ES[line] ?? line) : line;
    });
}

const RULES_ES: Record<string, string> = {
  'Quiet hours in this mountain neighborhood. No parties or events without written approval. Follow the septic and trash notes below. No smoking indoors.':
    'Horas de silencio en este vecindario de montaña. No fiestas ni eventos sin aprobación por escrito. Sigue las notas del séptico y la basura. No fumar adentro.',
  'Quiet hours 10 PM to 8 AM. No parties. Stay within the booked guest count. No smoking indoors.':
    'Horas de silencio de 10 PM a 8 AM. No fiestas. Quédate dentro del número de huéspedes reservado. No fumar adentro.',
  'Quiet hours 10 PM to 8 AM. No smoking indoors. No parties.':
    'Horas de silencio de 10 PM a 8 AM. No fumar adentro. No fiestas.',
};

/** Whether quiet hours are in effect. River publishes no window, so it states the rule without a time. Not a checklist line. */
export function cleanQuietLine(house: HouseId, lang: CleanLang, hour = denverHour()): string {
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  const tail = lang === 'es' ? 'Esto no es una línea de la lista. No se envió nada.' : 'This is not a checklist line. Nothing was sent.';
  let line: string;
  if (house === 'river') {
    line = lang === 'es'
      ? 'Aplican horas de silencio en este vecindario del cañón. Baje el volumen de noche para no molestar a los vecinos.'
      : 'Quiet hours apply in this canyon neighborhood. Keep noise down at night so the neighbors are not disturbed.';
  } else if (h >= 22 || h < 8) {
    line = lang === 'es'
      ? 'Las horas de silencio están en vigor hasta las 8:00 AM.'
      : 'Quiet hours are in effect until 8:00 AM.';
  } else {
    line = lang === 'es'
      ? 'Las horas de silencio no están en vigor. Son de 10:00 PM a 8:00 AM.'
      : 'Quiet hours are not in effect. They run from 10:00 PM to 8:00 AM.';
  }
  const text = `${line} ${tail}`;
  if (text.includes('$') || /door\s*code|wi-?fi|password/i.test(text)) return tail;
  return text;
}

/** Safety from the stay agreement. The card does not sign it. */
export function cleanSafetyLine(lang: CleanLang): string {
  if (lang === 'es') {
    return 'No hay salvavidas de turno. Los niños necesitan un adulto responsable cerca del agua, las escaleras, las terrazas y la calle. No fuegos artificiales. Esta tarjeta no firma el acuerdo. No se envió nada.';
  }
  const line = agreementTopicLine('safety').replace(
    'This page does not sign that. Nothing is sent.',
    'This card does not sign the agreement. Nothing was sent.',
  );
  if (!line || line.includes('$') || /door\s*code|wi-?fi|password/i.test(line)) return '';
  return line;
}

/** The guest's stay rule. Quiet hours and no smoking. This is not the cleaner checklist. */
export function workOrderRules(house: HouseId, lang: CleanLang): string[] {
  return houseRules(house)
    .filter((rule) => rule.id === 'stay')
    .map((rule) => (lang === 'es' ? (RULES_ES[rule.text] ?? rule.text) : rule.text))
    .filter((text) => text.length > 0 && !/door\s*code|wi-?fi|password/i.test(text));
}

const NOTES_ES: Record<string, string> = {
  'Septic. The house is on septic. Only toilet paper goes in the toilets. No wipes, even flushable ones.':
    'Séptico. La casa usa séptico. Solo papel higiénico en los inodoros. Nada de toallitas, aunque digan que se pueden tirar.',
  'The river. The Provo River runs cold and fast, especially in spring. Watch kids near the bank and wear life jackets on the water.':
    'El río. El río Provo corre frío y rápido, sobre todo en primavera. Cuida a los niños en la orilla y usa chalecos salvavidas en el agua.',
  'Hot tub. Keep the cover on when not in use. No glass in or near the tub. Kids with an adult only.':
    'Jacuzzi. Deja la cubierta puesta cuando no se use. Nada de vidrio en el jacuzzi ni cerca. Niños solo con un adulto.',
};

/** Published house notes for the cleaner. A note that names a door code or Wi-Fi is left off. */
export function workOrderNotes(house: HouseId, lang: CleanLang = 'en'): string[] {
  return houseStay(house).notes
    .filter((note) => !/door\s*code|wi-?fi|password/i.test(`${note.title} ${note.body}`))
    .map((note) => {
      const line = `${note.title}. ${note.body}`;
      return lang === 'es' ? (NOTES_ES[line] ?? line) : line;
    });
}

const LEAVING_ES: Record<string, string> = {
  'Start the dishwasher.': 'Enciende el lavavajillas.',
  'Put used towels in the laundry room.': 'Pon las toallas usadas en el cuarto de lavado.',
  'Take kitchen trash to the outside bins.': 'Lleva la basura de la cocina a los botes de afuera.',
  'Turn off lights and the fireplace, close windows.': 'Apaga las luces y la chimenea, y cierra las ventanas.',
  'Lock the door behind you. The lock will reset for the next guests.':
    'Cierra la puerta al salir. La cerradura se reinicia para los siguientes huéspedes.',
  'Only toilet paper goes in the toilets. No wipes, even flushable ones.':
    'Solo papel higiénico en los inodoros. Nada de toallitas, aunque digan que se pueden tirar.',
  'Put the hot tub cover back on.': 'Vuelve a poner la cubierta del jacuzzi.',
};

/** What the guest was asked to do before leaving. This is not the cleaner checklist. */
export function workOrderLeaving(house: HouseId, lang: CleanLang): string[] {
  return houseStay(house).checkout
    .map((step) => step.trim())
    .filter((step) => step.length > 0 && !/door\s*code|wi-?fi|password/i.test(step))
    .map((step) => (lang === 'es' ? (LEAVING_ES[step] ?? step) : step));
}

const SHARED_CHECKOUT = new Set<string>(STAY_CHECKOUT);

/** One brief line. Each house keeps the published extra step. No door code. */
export function guestLeavingLine(): string {
  const shared =
    'Before checkout the guest was asked to start the dishwasher, put used towels in the laundry room, take the kitchen trash out, turn off the lights and the fireplace, and lock the door.';
  const extra = (house: HouseId, name: string) => {
    const steps = houseStay(house).checkout.filter(
      (step) => !SHARED_CHECKOUT.has(step) && !step.includes('$') && !/door\s*code|wi-?fi|password/i.test(step),
    );
    return steps.length > 0 ? `${name}: ${steps.join(' ')}` : '';
  };
  const line = [shared, extra('river', 'The River House'), extra('ranch', 'The Ranch House'), 'The Lindon House keeps that shared list. Nothing is sent.']
    .filter((part) => part.length > 0)
    .join(' ');
  if (line.includes('$') || /door\s*code|wi-?fi|password/i.test(line)) {
    return `${shared} Nothing is sent.`;
  }
  return line;
}

/**
 * The photo line counts only after a room photo is attached and the box is checked.
 *
 * `photosAvailable` exists because the requirement had no escape hatch. Photo storage is not configured on this
 * deployment (`storageConfigured: false`), so an upload always answers 503 — which meant `photoCount` could never
 * exceed zero, the step could never be ticked, and no turnover could ever reach done. Measured on production: a
 * cleaner ticked all seven steps, the desk summary said "1 turnover is done", and the card beside it could only
 * count 6.
 *
 * When the site cannot accept a photo, demanding one is not a standard; it is a dead end. The tick alone counts, and
 * the page says why the photo is missing.
 */
export function stepDone(stepId: string, checked: boolean, photoCount: number, photosAvailable = true): boolean {
  if (stepId === 'photos') return checked && (photoCount > 0 || !photosAvailable);
  return checked;
}

export function jobDoneCount(
  steps: ReadonlyArray<{ id: string }>,
  checks: Record<string, boolean>,
  jobId: string,
  photoCount: number,
  photosAvailable = true,
): number {
  return steps.filter((step) => stepDone(step.id, Boolean(checks[`${jobId}:${step.id}`]), photoCount, photosAvailable)).length;
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
