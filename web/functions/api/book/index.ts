import { corsJson, PROPERTIES } from '../../_lib/data';
import { gmailSend } from '../../_lib/gmail-store';
import { kvGet, kvPut, newId } from '../../_lib/kv-json';
import type { SettingsEnv } from '../../_lib/kv';
import { loadCalendarBlocks } from '../../_lib/calendar-store';
import { getAllReservations } from '../../_lib/reservations-store';
import { isHouseId, occupiedNights, type StaySpan } from '../../../src/lib/availability';

interface BookingRequest {
  id: string;
  name: string;
  email: string;
  phone: string;
  propertyId: string;
  checkIn: string;
  checkOut: string;
  note: string;
  returning: boolean;
  createdAt: string;
}

export const onRequestPost: PagesFunction<SettingsEnv> = async ({ request, env }) => {
  const body = (await request.json()) as Partial<BookingRequest>;
  const name = body.name?.trim() ?? '';
  const email = body.email?.trim() ?? '';
  const propertyId = body.propertyId?.trim() ?? '';
  if (!name || !email.includes('@') || !PROPERTIES[propertyId]) {
    return corsJson(request, { error: 'Name, email, and house are required.' }, 400);
  }
  const entry: BookingRequest = {
    id: newId('book'),
    name,
    email,
    phone: body.phone?.trim() ?? '',
    propertyId,
    checkIn: body.checkIn?.trim() ?? '',
    checkOut: body.checkOut?.trim() ?? '',
    note: body.note?.trim() ?? '',
    returning: Boolean(body.returning),
    createdAt: new Date().toISOString(),
  };
  if (isHouseId(propertyId) && entry.checkIn && entry.checkOut && entry.checkOut > entry.checkIn) {
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
    const taken = occupiedNights(spans, propertyId, entry.checkIn, entry.checkOut);
    if (taken.length > 0) {
      return corsJson(request, { error: 'Those nights are already booked.' }, 409);
    }
  }
  const list = await kvGet<BookingRequest[]>(env, 'booking-requests', []);
  list.unshift(entry);
  await kvPut(env, 'booking-requests', list.slice(0, 100));
  const house = PROPERTIES[propertyId]?.name ?? propertyId;
  const sent = await gmailSend(
    env,
    'utahmountainluxury@gmail.com',
    `Direct request · ${house} · ${name}`,
    [
      `${name} asked to book ${house}.`,
      entry.returning ? 'They have stayed before.' : 'New to us, or they did not say.',
      `Email: ${email}`,
      entry.phone ? `Phone: ${entry.phone}` : '',
      entry.checkIn ? `Dates: ${entry.checkIn} to ${entry.checkOut}` : '',
      entry.note,
    ]
      .filter(Boolean)
      .join('\n'),
  );
  return corsJson(request, { ok: true, id: entry.id, emailed: !sent.error, emailError: sent.error });
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
