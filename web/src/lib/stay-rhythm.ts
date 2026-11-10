import { houseStay } from './house-stay';
import { stayEventLine } from './market/events';
import type { HouseId } from './market/types';

export type RhythmLine = { id: 'arrive' | 'code' | 'quiet' | 'leave' | 'event' | 'hold'; text: string };

function quietLine(house: HouseId): string {
  if (house === 'river') {
    return 'Quiet hours in this mountain neighborhood. No parties or events without written approval. No smoking indoors.';
  }
  return 'Quiet hours 10 PM to 6 AM. No parties. No smoking indoors.';
}

function longDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day)).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** The published rhythm for these dates. It does not say the house is open, and it has no price or door code. */
export function stayRhythm(house: HouseId, checkIn: string, checkOut: string): RhythmLine[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut) || checkOut <= checkIn) return [];
  const stay = houseStay(house);
  const lines: RhythmLine[] = [
    { id: 'arrive', text: `Arrive ${longDate(checkIn)} at ${stay.checkIn}.` },
  ];
  lines.push({ id: 'code', text: 'The door code stays off this page. Nothing is sent.' });
  lines.push({ id: 'quiet', text: quietLine(house) });
  lines.push({ id: 'leave', text: `Leave ${longDate(checkOut)} at ${stay.checkOut}.` });
  const event = stayEventLine(checkIn, checkOut);
  if (event) lines.push({ id: 'event', text: event });
  lines.push({ id: 'hold', text: 'These times are the house rhythm. This page does not hold the dates or charge a card.' });
  return lines;
}

/** The current hour in Utah. Midnight from some clocks is reported as 24. */
export function denverHour(now = new Date()): number {
  const hour = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Denver',
    hour: 'numeric',
    hourCycle: 'h23',
  })
    .formatToParts(now)
    .find((part) => part.type === 'hour')?.value;
  const value = Number(hour);
  if (!Number.isFinite(value)) return 0;
  return value === 24 ? 0 : ((value % 24) + 24) % 24;
}

/** Quiet hours right now. The quote does not call the house open. */
export function quietNowLine(house: HouseId, hour: number, where: 'quote' | 'phone'): string {
  const line = quietNow(house, hour);
  if (where === 'quote') return `${line} This does not say the house is open.`;
  return line;
}

/**
 * Whether the published quiet-hours window is in effect.
 *
 * The River House was the exception here: its guide named no clock, so this returned a sentence with no time rather than
 * inventing one — and the comment said setting the clock was a host task. The owner set it on 2026-11-10 (10 PM to 6 AM, the
 * same at all three houses), so the branch is gone and every house gets the real window.
 */
export function quietNow(house: HouseId, hour: number): string {
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  // `house` is kept for the caller's sake and named in the answer, but the window is the same everywhere.
  const name = house === 'river' ? 'The River House' : house === 'ranch' ? 'The Ranch House' : 'The Lindon House';
  if (h >= 22 || h < 6) return `${name}: quiet hours are in effect until 6:00 AM.`;
  return `${name}: quiet hours are not in effect. They run from 10:00 PM to 6:00 AM.`;
}

/** A right-now quiet-hours question. Other questions stay on the published guide. */
export function quietNowAnswer(query: string, house: HouseId, hour = denverHour()): string | null {
  const q = query.toLowerCase();
  if (!/\bquiet\b/.test(q)) return null;
  if (!/\b(now|tonight|currently)\b/.test(q) && !/\bin effect\b/.test(q)) return null;
  const text = quietNow(house, hour);
  if (text.includes('$') || /door\s*code|wi-?fi|password/i.test(text)) return null;
  return text;
}

/**
 * Ranch and Lindon share one clock. River publishes quiet hours without a window, so its half of the
 * sentence states what applies there and says nothing about the guide behind it.
 */
export function homeQuietLine(hour: number): string {
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  const valley = h >= 22 || h < 8 ? 'Quiet hours are in effect until 6:00 AM.' : 'Quiet hours are not in effect. They run from 10:00 PM to 6:00 AM.';
  return `Ranch and Lindon: ${valley} The River House sits in a canyon neighborhood, so keep noise down at night.`;
}
