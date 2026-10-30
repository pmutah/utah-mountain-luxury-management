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
