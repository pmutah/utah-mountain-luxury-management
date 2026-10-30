import { occupiedByHouse, type StaySpan } from '../../../src/lib/availability';
import { addDays, denverToday } from '../../../src/lib/market/dates';
import { loadCalendarBlocks } from '../../_lib/calendar-store';
import { corsJson } from '../../_lib/data';
import type { SettingsEnv } from '../../_lib/kv';
import { getAllReservations } from '../../_lib/reservations-store';

/** Public booked nights only. No guest names, payouts, or contact details. */
export const onRequestGet: PagesFunction<SettingsEnv> = async ({ request, env }) => {
  const from = denverToday();
  const until = addDays(from, 540);
  const stays = await getAllReservations(env);
  const blocks = await loadCalendarBlocks(env);
  const spans: StaySpan[] = [
    ...stays.map((stay) => ({
      propertyId: stay.propertyId,
      checkIn: stay.checkIn,
      checkOut: stay.checkOut,
      status: stay.status,
    })),
    ...blocks.map((block) => ({
      propertyId: block.propertyId,
      checkIn: block.start,
      checkOut: block.end,
    })),
  ];
  const closed = occupiedByHouse(
    blocks.map((block) => ({
      propertyId: block.propertyId,
      checkIn: block.start,
      checkOut: block.end,
    })),
    from,
    until,
  );
  return corsJson(request, { from, until, nights: occupiedByHouse(spans, from, until), closed });
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
