import { addDays } from './market/dates';

/** Times after the 4:00 PM check-in. Arrive at 1:00 PM stays on the early-arrival add-on. */
export const ARRIVAL_SLOTS = ['4:00 PM', '5:00 PM', '6:00 PM', '7:00 PM', '8:00 PM', '9:00 PM', 'After 9:00 PM'] as const;

export type ArrivalSlot = (typeof ARRIVAL_SLOTS)[number];

export function isArrivalSlot(value: string): value is ArrivalSlot {
  return (ARRIVAL_SLOTS as readonly string[]).includes(value);
}

/** The line a request note would include. An early-arrival add-on already names 1:00 PM. */
export function arrivalNote(slot: string | null, early: boolean): string {
  if (early || !slot || !isArrivalSlot(slot)) return '';
  if (slot === 'After 9:00 PM') return 'Arrival after 9:00 PM. Quiet hours still apply.';
  return `Arrival around ${slot}.`;
}

/** Older preference cards used a range. The words stay fixed so a typed phone cannot come through. */
const LEGACY_WINDOWS: Record<string, string> = {
  '4–6 PM': 'Arrival between 4:00 PM and 6:00 PM.',
  '6–8 PM': 'Arrival between 6:00 PM and 8:00 PM.',
  '8–10 PM': 'Arrival between 8:00 PM and 10:00 PM. Quiet hours still apply.',
  'After 10 PM': 'Arrival after 10:00 PM. Quiet hours still apply.',
};

const HOUSES = ['river', 'ranch', 'lindon'] as const;
const LABEL: Record<(typeof HOUSES)[number], string> = { river: 'River', ranch: 'Ranch', lindon: 'Lindon' };

function isHouse(id: string): id is (typeof HOUSES)[number] {
  return HOUSES.includes(id as (typeof HOUSES)[number]);
}

function shortWhen(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** A saved preference window, or empty when the value is not one we offered. */
export function guestArrivalLine(value: string | null | undefined): string {
  const text = value?.trim() ?? '';
  if (!text) return '';
  if (isArrivalSlot(text)) return arrivalNote(text, false);
  return LEGACY_WINDOWS[text] ?? '';
}

/** The sentence on a host stay card. An unknown window is treated as unnamed. */
export function hostArrivalPhrase(value: string | null | undefined): string {
  const line = guestArrivalLine(value);
  if (!line) return 'This stay does not name an arrival time.';
  return `This stay names an arrival. ${line}`;
}

/** Options for the classic card. A saved older range stays visible. */
export function arrivalSelectOptions(current: string | undefined): string[] {
  const slots: string[] = [...ARRIVAL_SLOTS];
  const extra = current?.trim() ?? '';
  if (extra && guestArrivalLine(extra) && !slots.includes(extra)) slots.push(extra);
  return slots;
}

/** Which stays beginning in the next 90 days named an arrival time. Names stay off the sentence. */
export function arrivalBrief(
  stays: readonly { id: string; propertyId: string; checkIn: string; status?: string }[],
  windows: Readonly<Record<string, string | undefined>>,
  asOf: string,
): string {
  const tail = 'Names stay off this line.';
  const none = `No stays begin in the next 90 days. ${tail}`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return none;
  const until = addDays(asOf, 90);
  const upcoming = stays
    .filter((stay) => stay.status !== 'cancelled' && stay.status !== 'blocked' && isHouse(stay.propertyId))
    .filter((stay) => /^\d{4}-\d{2}-\d{2}$/.test(stay.checkIn) && stay.checkIn >= asOf && stay.checkIn < until)
    .sort((a, b) => a.checkIn.localeCompare(b.checkIn) || a.propertyId.localeCompare(b.propertyId));
  if (upcoming.length === 0) return none;
  const named = upcoming.filter((stay) => guestArrivalLine(windows[stay.id]));
  const missing = upcoming.filter((stay) => !guestArrivalLine(windows[stay.id]));
  const missingShown = missing
    .slice(0, 6)
    .map((stay) => `${LABEL[stay.propertyId as (typeof HOUSES)[number]]} ${shortWhen(stay.checkIn)}`);
  const missingMore = missing.length - missingShown.length;
  const missingList = `${missingShown.join(', ')}${missingMore > 0 ? `, and ${missingMore} more` : ''}`;
  if (missing.length === 0) {
    return `Every stay beginning in the next 90 days names an arrival time. ${named.length} ${named.length === 1 ? 'stay' : 'stays'}. ${tail}`;
  }
  if (named.length === 0) {
    return `No stay beginning in the next 90 days names an arrival time. ${missingList}. ${tail}`;
  }
  const namedShown = named.slice(0, 6).map((stay) => {
    const when = `${LABEL[stay.propertyId as (typeof HOUSES)[number]]} ${shortWhen(stay.checkIn)}`;
    const line = guestArrivalLine(windows[stay.id]).replace(/\.$/, '');
    return `${when}, ${line}`;
  });
  const namedMore = named.length - namedShown.length;
  const namedList = `${namedShown.join('; ')}${namedMore > 0 ? `; and ${namedMore} more` : ''}`;
  const namedWord = named.length === 1 ? 'stay names' : 'stays name';
  const missingWord = missing.length === 1 ? 'does' : 'do';
  return `${named.length} ${namedWord} an arrival time: ${namedList}. ${missing.length} ${missingWord} not: ${missingList}. ${tail}`;
}
