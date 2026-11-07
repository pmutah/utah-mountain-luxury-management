import { addDays } from './dates';

/** Names and dates only. Premiums stay in the pricing doctrine and are not copied here. */
export type NamedEvent = { start: string; end: string; name: string };

/** Keep the dates in step with `EVENTS` in `functions/_lib/pricing-doctrine.ts`. `end` is exclusive. */
export const NAMED_EVENTS: readonly NamedEvent[] = [
  { start: '2026-05-22', end: '2026-05-25', name: 'Memorial Day weekend' },
  { start: '2026-07-02', end: '2026-07-05', name: 'July 4 weekend' },
  { start: '2026-09-04', end: '2026-09-07', name: 'Labor Day and BYU vs Utah Tech' },
  { start: '2026-09-11', end: '2026-09-13', name: 'BYU vs Arizona' },
  { start: '2026-10-08', end: '2026-10-11', name: 'BYU vs Iowa State (Friday)' },
  { start: '2026-10-16', end: '2026-10-18', name: 'BYU vs Notre Dame' },
  { start: '2026-10-30', end: '2026-11-01', name: 'BYU vs Arizona State' },
  { start: '2026-11-06', end: '2026-11-08', name: 'BYU at Utah' },
  { start: '2026-11-13', end: '2026-11-15', name: 'BYU vs Baylor' },
  { start: '2026-11-25', end: '2026-11-29', name: 'Thanksgiving and BYU vs Cincinnati' },
  { start: '2026-12-23', end: '2027-01-02', name: 'Christmas through New Year' },
  { start: '2027-01-15', end: '2027-01-18', name: 'MLK weekend' },
  { start: '2027-02-12', end: '2027-02-15', name: 'Presidents Day weekend' },
];

export function eventsTouchingMonth(month: string): NamedEvent[] {
  const start = `${month}-01`;
  const [year, monthNumber] = month.split('-').map(Number);
  const next = new Date(Date.UTC(year, monthNumber, 1)).toISOString().slice(0, 10);
  return NAMED_EVENTS.filter((event) => event.start < next && event.end > start);
}

export function eventLabel(event: NamedEvent): string {
  const last = addDays(event.end, -1);
  if (event.start === last) return `${event.name}, ${shortDate(event.start)}`;
  const endLabel = event.start.slice(0, 7) === last.slice(0, 7) ? String(Number(last.slice(8))) : shortDate(last);
  return `${event.name}, ${shortDate(event.start)}–${endLabel}`;
}

export function stayEvents(checkIn: string, checkOut: string): NamedEvent[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut) || checkOut <= checkIn) return [];
  return NAMED_EVENTS.filter((event) => event.start < checkOut && event.end > checkIn);
}

function eventNames(events: readonly NamedEvent[]): string {
  const names = events.map((event) => event.name);
  if (names.length === 1) return names[0]!;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export function eventNameOn(iso: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  return NAMED_EVENTS.find((event) => iso >= event.start && iso < event.end)?.name ?? null;
}

export function stayEventLine(checkIn: string, checkOut: string): string | null {
  const events = stayEvents(checkIn, checkOut);
  if (events.length === 0) return null;
  return `This stay covers ${eventNames(events)}. Nothing extra is added for that.`;
}

export function nextStayEventLine(checkIn: string, checkOut: string): string | null {
  const events = stayEvents(checkIn, checkOut);
  if (events.length === 0) return null;
  return `The next stay covers ${eventNames(events)}. Nothing extra is added for that.`;
}

export function nextEventLine(asOf: string, days = 90): string {
  const end = addDays(asOf, days);
  const upcoming = NAMED_EVENTS.filter((event) => event.end > asOf && event.start < end);
  const next = upcoming[0];
  if (!next) return 'No named event in the next 90 days. Nothing extra is added for an event.';
  return `Next named event: ${eventLabel(next)}. Nothing extra is added for it.`;
}

export function eventLine(month: string): string {
  const events = eventsTouchingMonth(month);
  if (events.length === 0) return 'No named event this month.';
  return events.map(eventLabel).join(' · ');
}

function shortDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
