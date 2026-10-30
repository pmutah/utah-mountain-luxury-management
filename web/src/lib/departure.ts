import { addDays } from './market/dates';
import type { UpsellId } from './upsells';

/** Published checkout, or the late leave already on the add-on menu. Other text cannot pass as a time. */
export const DEPARTURE_SLOTS = ['11:00 AM', '2:00 PM'] as const;

export type DepartureSlot = (typeof DEPARTURE_SLOTS)[number];

const LINES: Record<DepartureSlot, string> = {
  '11:00 AM': 'Leave at 11:00 AM.',
  '2:00 PM': 'Leave at 2:00 PM. Nothing is charged yet. A same-day arrival still starts at 4:00 PM.',
};

export function isDepartureSlot(value: string): value is DepartureSlot {
  return (DEPARTURE_SLOTS as readonly string[]).includes(value);
}

/** A saved leave time, or empty when the value is not one we offered. */
export function guestDepartureLine(value: string | null | undefined): string {
  const text = value?.trim() ?? '';
  if (!isDepartureSlot(text)) return '';
  return LINES[text];
}

/** The sentence on a host stay card. An unknown value is treated as unnamed. */
export function hostDeparturePhrase(value: string | null | undefined): string {
  const line = guestDepartureLine(value);
  if (!line) return 'This checkout does not name a departure time.';
  return `This checkout names a departure. ${line}`;
}

/** The quote line. 2:00 PM stays off when that night is not open for a later leave. */
export function quoteLeave(slot: string | null | undefined, lateOpen: boolean): string {
  if (slot === '2:00 PM' && !lateOpen) return '';
  return guestDepartureLine(slot);
}

/** Picking a leave time keeps the late-checkout add-on in agreement with it. */
export function applyDepartureChoice(
  slot: string | null,
  addons: readonly UpsellId[],
  lateOpen: boolean,
): { leave: DepartureSlot | null; addons: UpsellId[] } {
  const withoutLate = addons.filter((id) => id !== 'late');
  if (slot === '2:00 PM' && lateOpen) return { leave: '2:00 PM', addons: [...withoutLate, 'late'] };
  if (slot === '11:00 AM') return { leave: '11:00 AM', addons: withoutLate };
  return { leave: null, addons: withoutLate };
}

/** Checking the late add-on names 2:00 PM. Unchecking it clears only that leave time. */
export function applyLateAddon(on: boolean, leave: string | null): DepartureSlot | null {
  if (on) return '2:00 PM';
  if (leave === '2:00 PM') return null;
  return leave !== null && isDepartureSlot(leave) ? leave : null;
}

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

/** Which checkouts in the next 90 days named a departure time. Names stay off the sentence. */
export function departureBrief(
  stays: readonly { id: string; propertyId: string; checkOut: string; status?: string }[],
  windows: Readonly<Record<string, string | undefined>>,
  asOf: string,
): string {
  const tail = 'Names stay off this line.';
  const none = `No checkouts in the next 90 days. ${tail}`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return none;
  const until = addDays(asOf, 90);
  const upcoming = stays
    .filter((stay) => stay.status !== 'cancelled' && stay.status !== 'blocked' && isHouse(stay.propertyId))
    .filter((stay) => /^\d{4}-\d{2}-\d{2}$/.test(stay.checkOut) && stay.checkOut >= asOf && stay.checkOut < until)
    .sort((a, b) => a.checkOut.localeCompare(b.checkOut) || a.propertyId.localeCompare(b.propertyId));
  if (upcoming.length === 0) return none;
  const named = upcoming.filter((stay) => guestDepartureLine(windows[stay.id]));
  const missing = upcoming.filter((stay) => !guestDepartureLine(windows[stay.id]));
  const namedShown = named.slice(0, 6).map((stay) => {
    const when = `${LABEL[stay.propertyId as (typeof HOUSES)[number]]} ${shortWhen(stay.checkOut)}`;
    const line = guestDepartureLine(windows[stay.id]).replace(/\.$/, '');
    return `${when}, ${line}`;
  });
  const namedMore = named.length - namedShown.length;
  const namedList = `${namedShown.join('; ')}${namedMore > 0 ? `; and ${namedMore} more` : ''}`;
  const missingShown = missing
    .slice(0, 6)
    .map((stay) => `${LABEL[stay.propertyId as (typeof HOUSES)[number]]} ${shortWhen(stay.checkOut)}`);
  const missingMore = missing.length - missingShown.length;
  const missingList = `${missingShown.join(', ')}${missingMore > 0 ? `, and ${missingMore} more` : ''}`;
  if (missing.length === 0) {
    return `Every checkout in the next 90 days names a departure time. ${namedList}. ${tail}`;
  }
  if (named.length === 0) {
    return `No checkout in the next 90 days names a departure time. ${missingList}. ${tail}`;
  }
  const namedWord = named.length === 1 ? 'checkout names' : 'checkouts name';
  const missingWord = missing.length === 1 ? 'does' : 'do';
  return `${named.length} ${namedWord} a departure time: ${namedList}. ${missing.length} ${missingWord} not: ${missingList}. ${tail}`;
}
