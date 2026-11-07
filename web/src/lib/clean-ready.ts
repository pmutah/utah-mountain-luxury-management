import { PROPERTIES } from './api';
import {
  cleanLabel,
  workOrderEssentials,
  workOrderLeaving,
  workOrderNotes,
  workOrderPlace,
  cleanSafetyLine,
  workOrderRules,
  workOrderWhen,
  type CleanLang,
} from './clean';
import { eventPlans } from './event-plan';
import { houseStay } from './house-stay';
import { denverToday } from './market/dates';
import { standingTurnLine } from './turn-clock';
import type { HouseId } from './luxury';

const HOUSES: HouseId[] = ['river', 'ranch', 'lindon'];
const STEPS = ['beds', 'linens', 'kitchen', 'baths', 'floors', 'photos'];

export type CleanHouseCard = {
  house: HouseId;
  name: string;
  unread: string;
  when: string;
  place: string;
  rules: string[];
  essentials: string[];
  notes: string[];
  leaving: string[];
  steps: { id: string; label: string }[];
  prep: string;
  clock: string;
  photoGuide: string | null;
  event: string;
  safety: string;
};

/** Checkout mornings from the nights-only calendar. Names stay off the line. */
export function cleanTurnsLine(turns: readonly { house: HouseId; checkOut: string }[], lang: CleanLang = 'en'): string {
  const tail =
    lang === 'es'
      ? 'Esta tarjeta no nombra una estancia. No se reservó ni se envió nada.'
      : 'This card does not name a stay. Nothing was booked or sent.';
  const rows = turns
    .filter((turn) => turn.house === 'river' || turn.house === 'ranch' || turn.house === 'lindon')
    .filter((turn) => /^\d{4}-\d{2}-\d{2}$/.test(turn.checkOut))
    .sort((a, b) => a.checkOut.localeCompare(b.checkOut) || a.house.localeCompare(b.house));
  if (rows.length === 0) {
    const none = lang === 'es' ? 'No hay salidas en las próximas dos semanas.' : 'No checkouts in the next two weeks.';
    return `${none} ${tail}`;
  }
  const shown = rows.slice(0, 6);
  const more = rows.length - shown.length;
  const when = (iso: string) =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString(lang === 'es' ? 'es' : 'en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
  const list = shown.map((turn) => `${PROPERTIES[turn.house].name} ${when(turn.checkOut)}`).join(', ');
  const extra = more > 0 ? (lang === 'es' ? ` ${more} más.` : ` ${more} more.`) : '';
  const head = lang === 'es' ? 'Próximas salidas' : 'Next checkouts';
  const text = `${head}: ${list}.${extra} ${tail}`;
  if (text.includes('$') || /door\s*code|wi-?fi|password/i.test(text)) return tail;
  return text;
}

/** An empty checkout line stays off when the job cards already list a morning. */
export function cleanTurnsVisible(turns: readonly { checkOut: string }[] | null, jobCount: number): boolean {
  if (!turns) return false;
  if (turns.length === 0 && jobCount > 0) return false;
  return true;
}

/** The job list is empty. A checkout list that was read is not called empty here. */
export function cleanJobsEmptyLine(
  jobCount: number,
  turns: readonly { checkOut: string }[] | null,
  lang: CleanLang = 'en',
): string | null {
  if (jobCount > 0 || turns !== null) return null;
  const line =
    lang === 'es'
      ? 'Las salidas no se pudieron leer. Nada fue reservado ni enviado.'
      : 'Checkout mornings could not be read. Nothing was booked or sent.';
  if (line.includes('$') || /door\s*code|wi-?fi|password/i.test(line)) return null;
  return line;
}

/** The next event the rate card can quote. The card does not name a stay. */
export function cleanEventLine(house: HouseId, asOf: string, lang: CleanLang = 'en'): string {
  const tail =
    lang === 'es'
      ? 'Esta tarjeta no nombra una estancia. No se reservó ni se envió nada.'
      : 'This card does not name a stay. Nothing was booked or sent.';
  const next = eventPlans(house, asOf).find((line) => !line.startsWith('No named event'));
  if (!next || next.includes('$')) return tail;
  return `${next} ${tail}`;
}

/** The published bedroom line for the photo step. It does not invent rooms. */
export function photoGuideLine(house: HouseId, lang: CleanLang = 'en'): string | null {
  const bedrooms = houseStay(house).bedrooms?.trim() ?? '';
  if (!bedrooms || /\$|door\s*code|wi-?fi|password/i.test(bedrooms)) return null;
  if (lang === 'es') {
    return `Foto de cada cuarto antes de irte. La guía dice: ${bedrooms} Esa frase no es una lista nueva. Una foto se queda en esta pestaña y no se sube.`;
  }
  return `Photo each room before you leave. The guide says: ${bedrooms} That line is not a new list. A photo stays in this tab and is not uploaded.`;
}

/** Standing prep when no stay can be read. It does not say anyone asked. */
export function standingPrep(house: HouseId, lang: CleanLang): string {
  if (house === 'ranch') {
    return lang === 'es'
      ? 'Si la siguiente estancia pidió el jacuzzi, destápalo y caliéntalo. Esta tarjeta no dice que alguien lo pidió. No se cobra nada.'
      : 'If the next stay asked for the hot tub, uncover it and warm it. This card does not say that anyone asked. Nothing is charged.';
  }
  if (house === 'river') {
    return lang === 'es'
      ? 'Si la siguiente estancia pidió la entrega de víveres, deja las bolsas en la cocina. Esta tarjeta no dice que alguien lo pidió. No se cobra nada.'
      : 'If the next stay asked for a grocery drop, leave the bags in the kitchen. This card does not say that anyone asked. Nothing is charged.';
  }
  return lang === 'es'
    ? 'Esta casa no tiene jacuzzi ni entrega de víveres. Una llegada temprana y una salida más tarde esperan a que se pueda leer el calendario.'
    : 'This house has no hot tub and no grocery drop. An early arrival and a later checkout wait until the calendar can be read.';
}

/** Published house facts for the cleaner when the turnover list cannot be read. No stay is named. */
export function cleanHouseCards(lang: CleanLang, asOf = denverToday()): CleanHouseCard[] {
  const unread =
    lang === 'es'
      ? 'La lista de salidas no se pudo leer. Esta tarjeta no nombra una estancia.'
      : 'The turnover list could not be read. This card does not name a stay.';
  return HOUSES.map((house) => ({
    house,
    name: PROPERTIES[house].name,
    unread,
    when: workOrderWhen(house, false, lang),
    place: workOrderPlace(house, lang),
    rules: workOrderRules(house, lang),
    essentials: workOrderEssentials(house, lang),
    notes: workOrderNotes(house, lang),
    leaving: workOrderLeaving(house, lang),
    steps: STEPS.map((id) => ({ id, label: cleanLabel(id, lang) })),
    prep: standingPrep(house, lang),
    clock: standingTurnLine(lang),
    photoGuide: photoGuideLine(house, lang),
    event: cleanEventLine(house, asOf, lang),
    safety: cleanSafetyLine(lang),
  }));
}
