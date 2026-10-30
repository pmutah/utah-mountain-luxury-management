import { occupiedByHouse, type StaySpan } from './availability';
import { addDays, denverToday } from './market/dates';
import type { HouseId } from './market/types';
import { noteGuestCount } from './note-party';
import type { PaceStay } from './revenue-goals';

export type DateBlock = { propertyId: string; start: string; end: string };

/** Start and end only. A block note stays on the server response. */
export async function loadDateBlocks(): Promise<DateBlock[] | null> {
  const res = await fetch('/api/calendar/blocks').catch(() => null);
  const type = res?.headers.get('content-type') ?? '';
  if (!res?.ok || !type.includes('application/json')) return null;
  const body = (await res.json()) as { blocks?: Array<{ propertyId?: string; start?: string; end?: string }> };
  return (body.blocks ?? [])
    .filter((block) => block.propertyId && block.start && block.end)
    .map((block) => ({ propertyId: block.propertyId ?? '', start: block.start ?? '', end: block.end ?? '' }));
}

const EMPTY_NIGHTS: Record<HouseId, string[]> = { ranch: [], lindon: [], river: [] };

function asNights(value: unknown): Record<HouseId, string[]> | null {
  if (!value || typeof value !== 'object') return null;
  const nights = value as Record<HouseId, string[]>;
  if (!Array.isArray(nights.ranch) || !Array.isArray(nights.lindon) || !Array.isArray(nights.river)) return null;
  return nights;
}

/** Booked nights, plus calendar blocks kept apart. Guest names are not included. */
export async function loadQuoteCalendar(): Promise<{
  nights: Record<HouseId, string[]>;
  closed: Record<HouseId, string[]>;
} | null> {
  const from = denverToday();
  const until = addDays(from, 540);
  const live = await fetch('/api/book/availability').catch(() => null);
  const type = live?.headers.get('content-type') ?? '';
  if (live?.ok && type.includes('application/json')) {
    const body = (await live.json()) as { nights?: Record<HouseId, string[]>; closed?: Record<HouseId, string[]> };
    const nights = asNights(body.nights);
    if (nights) return { nights, closed: asNights(body.closed) ?? EMPTY_NIGHTS };
  }
  if (!import.meta.env.DEV) return null;
  const staysRes = await fetch('/api/reservations').catch(() => null);
  if (!staysRes?.ok) return null;
  const staysBody = (await staysRes.json()) as { reservations?: StaySpan[] };
  const blocksRes = await fetch('/api/calendar/blocks').catch(() => null);
  const blocksBody = blocksRes?.ok
    ? ((await blocksRes.json()) as { blocks?: { propertyId: string; start: string; end: string }[] })
    : { blocks: [] };
  const blocks = (blocksBody.blocks ?? []).map((block) => ({
    propertyId: block.propertyId,
    checkIn: block.start,
    checkOut: block.end,
  }));
  const spans: StaySpan[] = [
    ...(staysBody.reservations ?? []).map((stay) => ({
      propertyId: stay.propertyId,
      checkIn: stay.checkIn,
      checkOut: stay.checkOut,
      status: stay.status,
    })),
    ...blocks,
  ];
  return { nights: occupiedByHouse(spans, from, until), closed: occupiedByHouse(blocks, from, until) };
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
    reservations?: Array<{
      id?: string;
      propertyId?: string;
      checkIn?: string;
      checkOut?: string;
      status?: string;
      payout?: number;
      note?: string;
    }>;
  };
  return (body.reservations ?? []).map((stay) => ({
    id: typeof stay.id === 'string' && stay.id ? stay.id : undefined,
    propertyId: stay.propertyId ?? '',
    checkIn: stay.checkIn ?? '',
    checkOut: stay.checkOut ?? '',
    status: stay.status,
    payout: Number(stay.payout) || 0,
    partySize: noteGuestCount(typeof stay.note === 'string' ? stay.note : undefined),
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
