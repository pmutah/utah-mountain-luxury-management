import { corsJson, isRentalProperty, propertyName, PROPERTIES } from '../../_lib/data';
import { gmailSend } from '../../_lib/gmail-store';
import { kvGet, kvPut, newId } from '../../_lib/kv-json';
import type { SettingsEnv } from '../../_lib/kv';
import { loadCalendarBlocks } from '../../_lib/calendar-store';
import { getAllReservations } from '../../_lib/reservations-store';
import { isHouseId, housesForRequest, type StaySpan } from '../../../src/lib/availability';
import { bookingRequestHold } from '../../../src/lib/booking-request';
import { partyNote } from '../../../src/lib/house-stay';
import { holdConflict, holdConflictLine, holdExpiresAt, type BookingHold, type HoldWithState } from '../../../src/lib/booking-hold';
import { guestRequestReceipt, sentLine } from '../../../src/lib/booking-mail';
import { nightsBetween } from '../../../src/lib/booking-accept';
import { returningGuest, returningLine, type ReturningCheck } from '../../../src/lib/returning-guest';
import { addHolds, loadHolds } from '../../_lib/hold-store';
import { denverToday } from '../../../src/lib/market/dates';

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
  alsoPropertyId?: string;
  guests?: number;
  children?: number;
  /** The guest's own link to this request. It is the credential, so it is never shown on the host desk. */
  statusToken?: string;
}

export const onRequestPost: PagesFunction<SettingsEnv> = async ({ request, env }) => {
  /*
   * A body that will not parse is a bad request, not a server fault. `await request.json()` throws on
   * malformed input, and with no guard that throw reached the runtime: `POST /api/book` answered a
   * Cloudflare **500 "Worker threw exception"** page instead of a 400. A guest whose request body is
   * cut off by a flaky connection would see a crash page for a form they could simply resend.
   */
  let body: Partial<BookingRequest>;
  try {
    body = (await request.json()) as Partial<BookingRequest>;
  } catch {
    return corsJson(request, { error: 'That request could not be read. Send the form again.' }, 400);
  }
  if (!body || typeof body !== 'object') {
    return corsJson(request, { error: 'That request could not be read. Send the form again.' }, 400);
  }
  const name = body.name?.trim() ?? '';
  const email = body.email?.trim() ?? '';
  const propertyId = body.propertyId?.trim() ?? '';
  const alsoPropertyId = typeof body.alsoPropertyId === 'string' ? body.alsoPropertyId.trim() : '';
  if (!name || !email.includes('@') || !isRentalProperty(propertyId) || (alsoPropertyId && !isHouseId(alsoPropertyId))) {
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
    // The guest's own link to this request. Without one they hear nothing until a person writes back.
    statusToken: crypto.randomUUID().replace(/-/g, ''),
    ...(alsoPropertyId && alsoPropertyId !== propertyId ? { alsoPropertyId } : {}),
  };
  const houses = housesForRequest(propertyId, alsoPropertyId);
  if (houses.length === 0 || !entry.checkIn || !entry.checkOut || entry.checkOut <= entry.checkIn) {
    return corsJson(request, { error: 'This stay is not quoted.' }, 400);
  }
  const stays = await getAllReservations(env);
  const blocks = await loadCalendarBlocks(env);
  const staySpans: StaySpan[] = stays.map((stay) => ({
    propertyId: stay.propertyId,
    checkIn: stay.checkIn,
    checkOut: stay.checkOut,
    status: stay.status,
  }));
  const blockSpans: StaySpan[] = blocks.map((block) => ({
    propertyId: block.propertyId,
    checkIn: block.start,
    checkOut: block.end,
  }));
  const guests = wholeCount((body as { guests?: unknown }).guests);
  const children = wholeCount((body as { children?: unknown }).children);
  // The form used to send `returning: false` always, so the team was told every guest was new.
  // The server answers it from the past stays instead, on the contact details the guest typed.
  let returning: ReturningCheck;
  try {
    returning = returningGuest({ email, phone: entry.phone }, stays, denverToday());
    entry.returning = returning.returning;
  } catch {
    // A lookup that fails is not a claim that the guest is new.
    returning = { returning: false, lastStay: null, stays: 0 };
    entry.returning = Boolean(body.returning);
  }
  let holds: HoldWithState[];
  try {
    holds = await loadHolds(env);
  } catch {
    // A hold list that cannot be read is not treated as no holds; the request is refused below.
    return corsJson(
      request,
      { error: 'The date holds could not be read. Nothing was booked, and your request was not saved.' },
      503,
    );
  }
  const hold = bookingRequestHold({
    propertyId,
    alsoPropertyId,
    checkIn: entry.checkIn,
    checkOut: entry.checkOut,
    stays: staySpans,
    blocks: blockSpans,
    asOf: denverToday(),
    ...(guests !== undefined ? { guests } : {}),
    ...(children !== undefined ? { children } : {}),
  });
  if (hold) return corsJson(request, { error: hold }, 409);
  // A live hold for another guest means these nights are not this guest's to request yet.
  const conflict = holdConflict(holds, [...staySpans, ...blockSpans], propertyId, alsoPropertyId, entry.checkIn, entry.checkOut, new Date());
  if (conflict) {
    return corsJson(request, { error: holdConflictLine(conflict), held: true, house: conflict }, 409);
  }
  if (guests !== undefined && guests >= 1) entry.guests = guests;
  if (children !== undefined && children >= 0) entry.children = children;
  const party = entry.guests !== undefined ? partyNote(String(entry.guests), entry.children !== undefined ? String(entry.children) : '') : '';
  const list = await kvGet<BookingRequest[]>(env, 'booking-requests', []);
  list.unshift(entry);
  await kvPut(env, 'booking-requests', list.slice(0, 100));  const house =
    houses.map((id) => PROPERTIES[id].name).join(' and ') || propertyName(propertyId);
  const sent = await gmailSend(
    env,
    'utahmountainluxury@gmail.com',
    `Direct request · ${house} · ${name}`,
    [
      `${name} asked to book ${house}.`,
      returningLine(returning),
      `Email: ${email}`,
      entry.phone ? `Phone: ${entry.phone}` : '',
      entry.checkIn ? `Dates: ${entry.checkIn} to ${entry.checkOut}` : '',
      party,
      entry.note,
    ]
      .filter(Boolean)
      .join('\n'),
  );
  // The accepted request holds both houses until the guest finishes or the window closes.
  const now = new Date();
  const expiresAt = holdExpiresAt(now);
  const newHolds: BookingHold[] = houses.map((house) => ({
    id: newId(`hold-${house}`),
    propertyId: house,
    checkIn: entry.checkIn,
    checkOut: entry.checkOut,
    expiresAt,
    createdAt: now.toISOString(),
    requestId: entry.id,
  }));
  for (const hold of newHolds) {
    await addHolds(env, [hold]);
  }
  // The guest gets a receipt that says request and not booking. A failure here does not lose the request.
  // The receipt carries the guest's own status link, so they can check where the request stands
  // instead of waiting for a person to write back.
  const origin = new URL(request.url).origin;
  const statusLink = entry.statusToken ? `${origin}/request/${entry.statusToken}` : null;
  const receipt = guestRequestReceipt({
    guestName: entry.name,
    houses: houses.map((id) => String(id)),
    checkIn: entry.checkIn,
    checkOut: entry.checkOut,
    nights: nightsBetween(entry.checkIn, entry.checkOut),
    ...(entry.guests !== undefined ? { guests: entry.guests } : {}),
    ...(entry.children !== undefined ? { children: entry.children } : {}),
    ...(statusLink ? { statusLink } : {}),
  });
  const guestSent = await gmailSend(env, email, receipt.subject, receipt.body).catch((err) => ({
    error: err instanceof Error ? err.message : 'Guest mail failed',
  }));
  return corsJson(request, {
    ok: true,
    id: entry.id,
    emailed: !sent.error,
    emailError: sent.error,
    guestEmailed: !guestSent.error,
    guestEmailError: guestSent.error,
    guestLine: guestSent.error ? null : sentLine('receipt', email),
    heldUntil: expiresAt,
    // The browser shows the same link the email carries, so a guest who closes the tab can find it.
    statusPath: entry.statusToken ? `/request/${entry.statusToken}` : null,
  });
};

function wholeCount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) ? value : undefined;
}

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
