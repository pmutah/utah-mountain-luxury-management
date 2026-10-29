import { occupiedByHouse, type StaySpan } from './availability';
import { addDays, denverToday } from './market/dates';
import type { HouseId } from './market/types';

/** Dates only. Guest names from the reservations feed are dropped before they reach the page. */
export async function loadBookedNights(): Promise<Record<HouseId, string[]> | null> {
  const from = denverToday();
  const until = addDays(from, 540);
  const live = await fetch('/api/book/availability').catch(() => null);
  const type = live?.headers.get('content-type') ?? '';
  if (live?.ok && type.includes('application/json')) {
    const body = (await live.json()) as { nights?: Record<HouseId, string[]> };
    if (body.nights?.ranch && body.nights.lindon && body.nights.river) return body.nights;
  }
  if (!import.meta.env.DEV) return null;
  const staysRes = await fetch('/api/reservations').catch(() => null);
  if (!staysRes?.ok) return null;
  const staysBody = (await staysRes.json()) as { reservations?: StaySpan[] };
  const blocksRes = await fetch('/api/calendar/blocks').catch(() => null);
  const blocksBody = blocksRes?.ok
    ? ((await blocksRes.json()) as { blocks?: { propertyId: string; start: string; end: string }[] })
    : { blocks: [] };
  const spans: StaySpan[] = [
    ...(staysBody.reservations ?? []).map((stay) => ({
      propertyId: stay.propertyId,
      checkIn: stay.checkIn,
      checkOut: stay.checkOut,
      status: stay.status,
    })),
    ...(blocksBody.blocks ?? []).map((block) => ({
      propertyId: block.propertyId,
      checkIn: block.start,
      checkOut: block.end,
    })),
  ];
  return occupiedByHouse(spans, from, until);
}
