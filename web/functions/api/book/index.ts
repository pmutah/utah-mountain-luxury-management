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
import { loadRiverUnitRates } from '../../_lib/pricing-store';
import { unitRequestCheck } from '../../../src/lib/river-unit-request';
import { RIVER_UNIT_DETAIL } from '../../../src/lib/river-units';
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
  /**
   * Which parts of the Riverhouse this request takes. Absent means the whole house, which is what every request made
   * before parts existed means — so no existing request changes meaning.
   */
  units?: string[];
  /**
   * What the guest was shown for these dates, before tax.
   *
   * The quote is computed in the browser from the live rate card and the year's pace, so it is the figure the guest agreed
   * to. It is stored here because the accept route used to recompute with `pace: 'unknown'` — which drops the fill
   * promotion — and recorded a total **$1,340 higher** than the guest had seen on a three-night River stay. A booking must
   * be worth what the guest was quoted, not what today's card would produce.
   *
   * A client could send any number, so this is never trusted as money: it is compared against a fresh quote at accept, and
   * a difference is reported to the host rather than silently overriding either figure.
   */
  quotedTotal?: number;
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
    /*
     * What the guest was shown. Kept only when it is a real positive figure, because a zero or a junk value would record
     * "the guest agreed to nothing" — and absent is the honest state for an old client that does not send one yet.
     */
    ...(typeof body.quotedTotal === 'number' && Number.isFinite(body.quotedTotal) && body.quotedTotal > 0
      ? { quotedTotal: Math.round(body.quotedTotal * 100) / 100 }
      : {}),
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
    /*
     * `units` has to come through. Leaving it off made every booking read as the whole house, because absent means whole
     * house by design — so a Garage Suite booking blocked the Recreation Wing and the Main Lodge it never sold, and the
     * parts could never be sold alongside each other.
     */
    ...(stay.units && stay.units.length > 0 ? { units: stay.units } : {}),
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
  /*
   * A request to stay in **part** of the Riverhouse goes through its own gate, because the rules are different: two
   * parts together are one reservation, a part with no price is not sellable, and a whole-house booking blocks every
   * part. `bookingRequestHold` above treats the Riverhouse as one house, which is right for the whole house and wrong
   * for a part: a booked Recreation Wing would have refused a Main Lodge request before this gate was reached.
   *
   * The rates are read here rather than trusted from the browser: a client that says a part is priced must not be able
   * to book a part that never was.
   */
  const wantedUnits = Array.isArray(body.units) ? body.units.filter((unit): unit is string => typeof unit === 'string') : [];
  if (wantedUnits.length > 0) {
    if (propertyId !== 'river' || alsoPropertyId) {
      return corsJson(request, { error: 'Only the River House is sold in parts.' }, 400);
    }
    let unitRates;
    try {
      unitRates = await loadRiverUnitRates(env);
    } catch {
      return corsJson(
        request,
        { error: 'The part prices could not be read. Nothing was booked, and your request was not saved.' },
        503,
      );
    }
    const partCheck = unitRequestCheck(
      staySpans as never,
      unitRates,
      {
        units: wantedUnits,
        checkIn: entry.checkIn,
        checkOut: entry.checkOut,
        ...(guests !== undefined ? { guests } : {}),
      },
      blockSpans as never,
    );
    if (!partCheck.ok) return corsJson(request, { error: partCheck.reason, code: partCheck.code }, 409);
    entry.units = partCheck.units;
  } else {
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
  }
  // A live hold for another guest means these nights are not this guest's to request yet.
  const conflict = holdConflict(
    holds,
    [...staySpans, ...blockSpans],
    propertyId,
    alsoPropertyId,
    entry.checkIn,
    entry.checkOut,
    new Date(),
    /*
     * Pass the parts so the hold check agrees with the parts check above it. Without this, a Garage Suite request was
     * refused because a Recreation Wing booking "occupied" the house — the two gates disagreed, and the stricter one won.
     */
    wantedUnits.length > 0 && propertyId === 'river' && !alsoPropertyId ? wantedUnits : undefined,
  );
  if (conflict) {
    return corsJson(request, { error: holdConflictLine(conflict), held: true, house: conflict }, 409);
  }
  if (guests !== undefined && guests >= 1) entry.guests = guests;
  if (children !== undefined && children >= 0) entry.children = children;
  const party = entry.guests !== undefined ? partyNote(String(entry.guests), entry.children !== undefined ? String(entry.children) : '') : '';
  const list = await kvGet<BookingRequest[]>(env, 'booking-requests', []);
  list.unshift(entry);
  await kvPut(env, 'booking-requests', list.slice(0, 100));

  const house = houses.map((id) => PROPERTIES[id].name).join(' and ') || propertyName(propertyId);
  /*
   * What the host is told this request is for. A part request said "asked to book The River House", so the team email
   * alone could not tell a Garage Suite request from a whole-house one — and the team may act on that email before
   * opening the desk.
   */
  const askedFor =
    entry.units && entry.units.length > 0
      ? `${entry.units.map((unit) => RIVER_UNIT_DETAIL.find((detail) => detail.id === unit)?.name ?? unit).join(' and ')} at ${house}`
      : house;
  /*
   * `gmailSend` is not guaranteed to return an error object — it can throw (a token refresh that fails,
   * a network fault inside the Workers runtime). Unguarded, that throw replaced the whole response with a
   * Cloudflare 500 **after** the request had already been saved: the guest saw a crash page, the team got
   * no email, and the inbox row existed but the guest was never told. This is reachable only when a party
   * is given, because every request without `guests` returns 409 earlier in the function.
   *
   * The request is the thing that matters, so a mail failure is caught and reported beside it.
   */
  let sent: { error?: string };
  try {
    sent = await gmailSend(
      env,
      'utahmountainluxury@gmail.com',
      `Direct request · ${askedFor} · ${name}`,
      [
        `${name} asked to book ${askedFor}.`,
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
  } catch (err) {
    sent = { error: err instanceof Error ? err.message : 'The team email could not be sent.' };
  }
  /*
   * Everything from here on writes. `kvPut` above already saved the request, and `addHolds` below reads
   * and writes the hold list — three KV writes across two keys in one request. That is the shape that
   * has broken twice already on this project (one write per key per second), and a throw here is *after*
   * the request is saved, which is why the guest sees a crash page while the inbox is empty of the row
   * they just sent: the write that failed is the hold, and the whole response is replaced by a 500.
   *
   * The hold is a convenience — the request is already saved and the team already has the email. So a
   * hold failure must not destroy the confirmation. It is caught, reported, and the guest still gets
   * their status link.
   */
  const now = new Date();
  const expiresAt = holdExpiresAt(now);
  /*
   * A hold is kept per house. A request for part of the Riverhouse therefore holds the **whole** house for the
   * 30-minute window, which is stricter than the booking itself: two parts may be sold separately, but a request in
   * flight holds the house so no second guest can be promised a night that the first may take.
   *
   * That is deliberately conservative. A precise per-part hold would need `holdConflict` to carry units across every
   * house and every caller, and the cost of being wrong here is an overbooking; the cost of being conservative is at
   * most a lost request inside a half-hour window.
   */
  const newHolds: BookingHold[] = houses.map((houseId) => ({
    id: newId(`hold-${houseId}`),
    propertyId: houseId,
    checkIn: entry.checkIn,
    checkOut: entry.checkOut,
    expiresAt,
    createdAt: now.toISOString(),
    requestId: entry.id,
  }));
  let holdError: string | null = null;
  try {
    for (const hold of newHolds) {
      await addHolds(env, [hold]);
    }
  } catch (err) {
    holdError = err instanceof Error ? err.message : 'The dates could not be held.';
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
    /*
     * The parts this request takes, so the guest's own receipt names what they asked for instead of the whole house.
     * Absent for a whole-house request, which is every request made before parts existed.
     */
    ...(entry.units && entry.units.length > 0 ? { units: entry.units } : {}),
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
    heldUntil: holdError ? null : expiresAt,
    /**
     * A hold that could not be saved is reported, not swallowed. The request itself is safe — it was
     * written before this point and the team has the email — so the guest is told their dates are with
     * us rather than being handed a crash page.
     */
    holdError,
    ...(holdError ? { notice: 'Your request is saved. The short date hold could not be placed, so we will confirm the dates by hand.' } : {}),
    // The browser shows the same link the email carries, so a guest who closes the tab can find it.
    statusPath: entry.statusToken ? `/request/${entry.statusToken}` : null,
  });
};

function wholeCount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) ? value : undefined;
}

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
