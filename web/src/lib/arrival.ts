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
