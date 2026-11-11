import type { StaySpan } from './availability';
import { bothHouseMonthNights } from './compound';
import { isRealDay } from './market/dates';
import type { YearPace } from './market/fill';
import type { HouseId } from './market/types';
import { noteChildCount, noteGuestCount } from './note-party';
import type { PaceStay } from './revenue-goals';

export type DateBlock = { propertyId: string; start: string; end: string };

/** A paused or missing block list is not “no blocks.” An empty array is a real empty list. */
export function blocksIfRead(body: unknown): DateBlock[] | null {
  if (!body || typeof body !== 'object' || readPaused(body)) return null;
  const row = body as { blocks?: unknown };
  if (!Array.isArray(row.blocks)) return null;
  return row.blocks
    .filter((block): block is { propertyId?: string; start?: string; end?: string } => Boolean(block) && typeof block === 'object')
    .filter((block) => block.propertyId && block.start && block.end)
    .map((block) => ({ propertyId: block.propertyId ?? '', start: block.start ?? '', end: block.end ?? '' }));
}

/** Start and end only. A block note stays on the server response. */
export async function loadDateBlocks(): Promise<DateBlock[] | null> {
  const res = await fetch('/api/calendar/blocks').catch(() => null);
  const type = res?.headers.get('content-type') ?? '';
  if (!res?.ok || !type.includes('application/json')) return null;
  return blocksIfRead(await res.json());
}

function asNights(value: unknown): Record<HouseId, string[]> | null {
  if (!value || typeof value !== 'object') return null;
  const nights = value as Record<HouseId, string[]>;
  if (!Array.isArray(nights.ranch) || !Array.isArray(nights.lindon) || !Array.isArray(nights.river)) return null;
  return nights;
}

export type QuoteTurn = { house: HouseId; checkOut: string };

export type QuoteCalendar = {
  nights: Record<HouseId, string[]>;
  closed: Record<HouseId, string[]>;
  /** Nights another guest is finishing a request for. Never counted as booked. */
  held: Record<HouseId, string[]>;
  /**
   * Guest prices the host approved. Null when the sheet could not be read, so the page falls back to
   * the published card rather than showing a stand-in as approved.
   */
  approved: Record<HouseId, Array<{ date: string; guest: number }>> | null;
  pace: Record<HouseId, YearPace>;
  turns: QuoteTurn[] | null;
  /** The Riverhouse parts, or null when their prices could not be read. */
  units: PublicUnit[] | null;
};

/** One Riverhouse part as the booking page shows it. */
export type PublicUnit = {
  id: string;
  name: string;
  sleeps: number;
  bedrooms: number;
  beds: number;
  baths: number;
  nightly: number | null;
  cleaning: number | null;
  minNights: number | null;
  rateState: 'unset' | 'partial' | 'ready';
  nights: string[];
};

const NO_APPROVED: Record<HouseId, Array<{ date: string; guest: number }>> = { ranch: [], lindon: [], river: [] };

/**
 * Approved nights from the calendar. A field that is absent is an older payload with no approvals.
 * A field that is null means the sheet could not be read, which is not the same as none approved.
 */
function asApproved(value: unknown): Record<HouseId, Array<{ date: string; guest: number }>> | null {
  if (value === undefined) return NO_APPROVED;
  if (value === null) return null;
  if (typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const out: Record<HouseId, Array<{ date: string; guest: number }>> = { ranch: [], lindon: [], river: [] };
  for (const house of ['ranch', 'lindon', 'river'] as const) {
    const list = row[house];
    if (list === undefined) continue;
    if (!Array.isArray(list)) return null;
    for (const entry of list) {
      if (!entry || typeof entry !== 'object') continue;
      const date = (entry as { date?: unknown }).date;
      const guest = (entry as { guest?: unknown }).guest;
      if (typeof date !== 'string' || typeof guest !== 'number') continue;
      if (!isRealDay(date) || !Number.isFinite(guest) || guest <= 0) continue;
      out[house].push({ date, guest: Math.round(guest) });
    }
  }
  return out;
}

const UNKNOWN_PACE: Record<HouseId, YearPace> = { ranch: 'unknown', lindon: 'unknown', river: 'unknown' };

function asPace(value: unknown): Record<HouseId, YearPace> {
  if (!value || typeof value !== 'object') return UNKNOWN_PACE;
  const row = value as Record<string, unknown>;
  const pace = { ...UNKNOWN_PACE };
  for (const house of ['ranch', 'lindon', 'river'] as const) {
    const word = row[house];
    if (word === 'short' || word === 'met' || word === 'unknown') pace[house] = word;
  }
  return pace;
}

function asTurns(value: unknown): QuoteTurn[] | null {
  if (!Array.isArray(value)) return null;
  const turns: QuoteTurn[] = [];
  for (const row of value) {
    if (!row || typeof row !== 'object') continue;
    const house = (row as { house?: unknown }).house;
    const checkOut = (row as { checkOut?: unknown }).checkOut;
    if ((house !== 'ranch' && house !== 'lindon' && house !== 'river') || typeof checkOut !== 'string') continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(checkOut)) continue;
    turns.push({ house, checkOut });
  }
  return turns;
}

/**
 * Riverhouse parts from the availability payload.
 *
 * A field that is absent is an older payload with no parts. A field that is null means the prices could not be read,
 * which is not the same as no parts for sale — a page that confused the two would silently stop offering them. An entry
 * whose nightly is not a real price is dropped rather than shown as a number.
 */
function asUnits(value: unknown): PublicUnit[] | null {
  if (value === undefined) return [];
  if (value === null) return null;
  if (!Array.isArray(value)) return null;
  const out: PublicUnit[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    if (typeof row.id !== 'string' || typeof row.name !== 'string') continue;
    const state = row.rateState;
    const nightly = typeof row.nightly === 'number' && Number.isFinite(row.nightly) && row.nightly > 0 ? Math.round(row.nightly) : null;
    const nights = Array.isArray(row.nights) ? row.nights.filter((night): night is string => typeof night === 'string' && isRealDay(night)) : [];
    out.push({
      id: row.id,
      name: row.name,
      sleeps: typeof row.sleeps === 'number' ? row.sleeps : 0,
      bedrooms: typeof row.bedrooms === 'number' ? row.bedrooms : 0,
      beds: typeof row.beds === 'number' ? row.beds : 0,
      baths: typeof row.baths === 'number' ? row.baths : 0,
      nightly,
      cleaning: typeof row.cleaning === 'number' && Number.isFinite(row.cleaning) && row.cleaning >= 0 ? Math.round(row.cleaning) : null,
      minNights: typeof row.minNights === 'number' && Number.isFinite(row.minNights) && row.minNights >= 1 ? Math.round(row.minNights) : null,
      rateState: state === 'ready' || state === 'partial' || state === 'unset' ? state : 'unset',
      nights,
    });
  }
  return out;
}

function readPaused(body: unknown): boolean {
  return Boolean(body && typeof body === 'object' && (body as { storageReads?: string }).storageReads === 'paused');
}

/** A paused read is not an empty calendar. Missing nights are not a calendar either. */
export function quoteCalendarFromAvailability(body: unknown): QuoteCalendar | null {
  if (!body || typeof body !== 'object' || readPaused(body)) return null;
  const row = body as { nights?: unknown; closed?: unknown; held?: unknown };
  const nights = asNights(row.nights);
  const closed = asNights(row.closed);
  if (!nights || !closed) return null;
  // A hold list that was omitted is no holds. A hold list that is present but broken is not a calendar.
  const held = row.held === undefined || row.held === null ? { ranch: [], lindon: [], river: [] } : asNights(row.held);
  if (!held) return null;
  return {
    nights,
    closed,
    held,
    approved: asApproved((body as { approved?: unknown }).approved),
    pace: asPace((body as { pace?: unknown }).pace),
    turns: asTurns((body as { turns?: unknown }).turns),
    units: asUnits((body as { units?: unknown }).units),
  };
}

/** Reservations from a paused read are not a calendar and are not a pace list. */
export function reservationsIfRead(body: unknown): StaySpan[] | null {
  if (!body || typeof body !== 'object' || readPaused(body)) return null;
  const row = body as { reservations?: unknown };
  if (!Array.isArray(row.reservations)) return null;
  return row.reservations as StaySpan[];
}

/** Booked nights and a pace word. A failed read is not an empty calendar. Guest names are not requested. */
export async function loadQuoteCalendar(): Promise<QuoteCalendar | null> {
  const live = await fetch('/api/book/availability').catch(() => null);
  const type = live?.headers.get('content-type') ?? '';
  if (!live?.ok || !type.includes('application/json')) return null;
  return quoteCalendarFromAvailability(await live.json());
}

/** Dates only. Guest names from the reservations feed are dropped before they reach the page. */
export async function loadBookedNights(): Promise<Record<HouseId, string[]> | null> {
  const calendar = await loadQuoteCalendar();
  return calendar?.nights ?? null;
}

/** Host payout, dates, and a party count when the note states one. Guest names stay on the server response and are not kept. */
export async function loadPaceStays(): Promise<PaceStay[] | null> {
  const res = await fetch('/api/reservations').catch(() => null);
  const type = res?.headers.get('content-type') ?? '';
  if (!res?.ok || !type.includes('application/json')) return null;
  const body = (await res.json()) as {
    storageReads?: string;
    reservations?: Array<{
      id?: string;
      propertyId?: string;
      checkIn?: string;
      checkOut?: string;
      status?: string;
      payout?: number;
      /** A cancellation fee the channel paid. Carried so the year pace counts it as revenue. */
      cancellationIncome?: number;
      note?: string;
    }>;
  };
  if (body.storageReads === 'paused' || !Array.isArray(body.reservations)) return null;
  return body.reservations.map((stay) => ({
    id: typeof stay.id === 'string' && stay.id ? stay.id : undefined,
    propertyId: stay.propertyId ?? '',
    checkIn: stay.checkIn ?? '',
    checkOut: stay.checkOut ?? '',
    status: stay.status,
    payout: Number(stay.payout) || 0,
    ...(typeof stay.cancellationIncome === 'number' && Number.isFinite(stay.cancellationIncome)
      ? { cancellationIncome: stay.cancellationIncome }
      : {}),
    partySize: noteGuestCount(typeof stay.note === 'string' ? stay.note : undefined),
    childCount: noteChildCount(typeof stay.note === 'string' ? stay.note : undefined),
  }));
}

/** How the booking page describes nights ahead. A calendar block is not a booked night. */
export function calendarAheadLine(taken: readonly string[], closed: readonly string[]): string {
  const blocks = new Set(closed);
  const booked = taken.filter((night) => !blocks.has(night)).length;
  const nights = booked === 1 ? '1 night ahead is' : `${booked} nights ahead are`;
  const held = closed.length === 1 ? '1 calendar block stays' : `${closed.length} calendar blocks stay`;
  return `${nights} already booked. ${held} closed. A block is not a booked night.`;
}

/** How far ahead is taken on the River House and the Ranch House. Lindon stays off this count. */
export function bothHouseCalendarAheadLine(
  taken: Partial<Record<HouseId, readonly string[]>>,
  closed: Partial<Record<HouseId, readonly string[]>> = {},
): string {
  const nights = bothHouseMonthNights(taken, closed);
  const line = calendarAheadLine(nights.taken, nights.closed);
  return line.replace('already booked.', 'already booked at the River House or the Ranch House.');
}
