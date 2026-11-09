import { corsJson } from '../../_lib/data';
import { hostDenied, hostOnly } from '../../_lib/auth';
import { kvGet } from '../../_lib/kv-json';
import { storageReadPaused } from '../../_lib/kv-json';
import { createReservation, getAllReservations } from '../../_lib/reservations-store';
import { loadCalendarBlocks } from '../../_lib/calendar-store';
import { releaseHoldsForRequest, loadHolds } from '../../_lib/hold-store';
import { occupiedNights, type StaySpan } from '../../../src/lib/availability';
import { unitBookingConflict } from '../../../src/lib/river-units';
import { acceptHold, acceptedLine, stayPlans } from '../../../src/lib/booking-accept';
import { quoteStay } from '../../../src/lib/quote';
import { twoHouseParties } from '../../../src/lib/payout-suggest';
import { guestAcceptedMail, sentLine } from '../../../src/lib/booking-mail';
import { gmailSend } from '../../_lib/gmail-store';
import { upsertSurveyForStay } from '../../_lib/survey-store';
import { updateReservation } from '../../_lib/reservations-store';
import { surveyPublicUrl } from '../../_lib/survey-copy';
import { guideEnabled } from '../../_lib/guest-guide';
import type { BookingRequestRow } from '../../../src/lib/booking-inbox';
import { denverToday } from '../../../src/lib/market/dates';
import type { HouseId } from '../../../src/lib/market/types';
import type { SettingsEnv } from '../../_lib/kv';

type Env = SettingsEnv & { DASHBOARD_PASSWORD?: string };

/**
 * Each house's **lodging** for this stay, when the party spans both houses. Null when the quote
 * cannot price one of them, so the split falls back to even rather than guessing a proportion.
 *
 * This is lodging and not the guest total on purpose: the payout being split is the host net, and
 * cleaning is a pass-through that differs per house, so weighting by the guest total put money on
 * the wrong house.
 */
function houseShares(
  request: BookingRequestRow,
  checkIn: string,
  checkOut: string,
): { payouts: Partial<Record<HouseId, number>>; guestTotals: Partial<Record<HouseId, number>> } | null {
  const also = request.alsoPropertyId;
  if (also !== 'river' && also !== 'ranch') return null;
  const guests = request.guests;
  if (typeof guests !== 'number' || !Number.isInteger(guests) || guests < 2) return null;
  const first = request.propertyId;
  if (first !== 'river' && first !== 'ranch') return null;
  const children = typeof request.children === 'number' ? request.children : 0;
  const quote = (house: 'river' | 'ranch', party: number) =>
    quoteStay(house, checkIn, checkOut, [], {
      pace: 'unknown',
      guests: party,
      ...(children > 0 && party > children ? { children } : {}),
    });
  // The same party divide the desk shows, so the figures a host approves are the figures written.
  const parties = twoHouseParties(guests);
  if (!parties) return null;
  const riverParty = parties[0]![1];
  const ranchParty = parties[1]![1];
  const river = quote('river', riverParty);
  const ranch = quote('ranch', ranchParty);
  if (!river.ok || !ranch.ok || river.lodging <= 0 || ranch.lodging <= 0) return null;
  /*
   * Lodging, not the guest total: the payout being split is the host net, and cleaning differs per
   * house, so weighting by the guest total put money on the wrong house.
   *
   * The guest totals are returned beside them from the same two quotes, so the figure stored on each
   * stay is one the guest actually saw rather than a second calculation that could drift.
   */
  return {
    payouts: first === 'river'
      ? { river: river.lodging, ranch: ranch.lodging }
      : { ranch: ranch.lodging, river: river.lodging },
    guestTotals: first === 'river'
      ? { river: river.stayTotal, ranch: ranch.stayTotal }
      : { ranch: ranch.stayTotal, river: river.stayTotal },
  };
}

/**
 * Turn one saved request into a booking. Host only, and it refuses a request that is already a
 * booking, a night now on the calendar, or a payout that is not a real number. It sends nothing.
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  let body: { id?: unknown; payout?: unknown; source?: unknown };
  try {
    body = (await request.json()) as { id?: unknown; payout?: unknown; source?: unknown };
  } catch {
    return corsJson(request, { error: 'Invalid JSON' }, 400);
  }
  const id = typeof body.id === 'string' ? body.id.trim() : '';
  const payout = typeof body.payout === 'number' ? body.payout : Number.NaN;
  const source = typeof body.source === 'string' ? body.source : 'Direct';
  if (!id) return corsJson(request, { error: 'A request id is required.' }, 400);

  let requests: BookingRequestRow[];
  let stays;
  let blocks;
  try {
    requests = await kvGet<BookingRequestRow[]>(env, 'booking-requests', []);
    stays = await getAllReservations(env);
    blocks = await loadCalendarBlocks(env);
  } catch (err) {
    if (storageReadPaused(err)) {
      return corsJson(request, { error: 'Saved requests could not be read. Nothing was booked.' }, 503);
    }
    const message = err instanceof Error ? err.message : 'Accept failed';
    return corsJson(request, { error: message }, 500);
  }

  const saved = requests.find((row) => row.id === id);
  if (!saved) return corsJson(request, { error: 'This request is not on the list.' }, 404);

  const alreadyAccepted = stays.some((stay) => (stay.note ?? '').includes(`Direct request ${id}.`));
  const spans: StaySpan[] = [
    ...stays.map((stay) => ({
      propertyId: stay.propertyId,
      checkIn: stay.checkIn,
      checkOut: stay.checkOut,
      status: stay.status,
      // A stay recorded before parts existed has no `units` and therefore occupies the whole house.
      ...(stay.units && stay.units.length > 0 ? { units: stay.units } : {}),
    })),
    ...blocks.map((block) => ({
      propertyId: block.propertyId,
      checkIn: block.start,
      checkOut: block.end,
    })),
  ];

  // Any house this request names has to be free of saved stays and blocks for those nights.
  const houses: HouseId[] = [];
  for (const house of [saved.propertyId, saved.alsoPropertyId]) {
    if ((house === 'river' || house === 'ranch' || house === 'lindon') && !houses.includes(house)) houses.push(house);
  }
  /*
   * A request for part of the Riverhouse is checked against **the parts it asked for**, not against the house. The
   * house-wide check is right for a whole-house stay and wrong for a part: it would refuse the Main Lodge because the
   * Recreation Wing was sold, which is the exact overbooking rule inverted.
   */
  const partUnits = Array.isArray(saved.units) ? saved.units.filter((unit) => typeof unit === 'string') : [];
  /*
   * At accept the only question is whether the parts are still free — the price was settled when the request was
   * taken. So this asks the blocking rules directly rather than going through `unitRequestCheck`, which would also
   * re-check pricing and could refuse a request the host had already agreed to.
   */
  const partClash =
    partUnits.length > 0 && saved.propertyId === 'river' && !saved.alsoPropertyId
      ? unitBookingConflict(
          spans as never,
          { units: partUnits as never, checkIn: saved.checkIn ?? '', checkOut: saved.checkOut ?? '' },
          saved.checkIn ?? '',
          saved.checkOut ?? '',
        )
      : null;
  const clash =
    partUnits.length > 0 && saved.propertyId === 'river' && !saved.alsoPropertyId
      ? partClash
        ? [`${partClash.unit} is already booked on ${partClash.night}.`]
        : []
      : houses.flatMap((house) => occupiedNights(spans, house, saved.checkIn ?? '', saved.checkOut ?? ''));

  const result = acceptHold({
    request: saved,
    alreadyAccepted,
    plan: {
      payout,
      source,
      takenOnHouse: clash,
      // A part booking says which part it sold, so the host's line does not claim the whole house.
      ...(partUnits.length > 0 && saved.propertyId === 'river' && !saved.alsoPropertyId ? { units: partUnits } : {}),
    },
    asOf: denverToday(),
  });
  if (!result.ok) return corsJson(request, { error: result.reason }, 409);

  // When the party spans both houses, each house's own quote total sets the payout proportion. That
  // follows the guest split, so a party of 30 does not book the Ranch as if it earned half.
  const shares = houseShares(saved, result.plan.checkIn, result.plan.checkOut);
  /*
   * A one-house request never reaches `houseShares`, so its guest total comes from its own quote here.
   * Without this the booking recorded only the host net and there was no way to invoice the guest.
   */
  const soloGuest = shares
    ? null
    : quoteStay(result.plan.propertyId, result.plan.checkIn, result.plan.checkOut, [], {
        pace: 'unknown',
        ...(saved.guests !== undefined ? { guests: saved.guests } : {}),
        ...(typeof saved.children === 'number' && (saved.children ?? 0) > 0 ? { children: saved.children } : {}),
      });
  const toSave = stayPlans(
    shares
      ? { ...result.plan, shares: shares.payouts, guestShares: shares.guestTotals }
      : soloGuest && soloGuest.ok && soloGuest.stayTotal > 0
        ? { ...result.plan, guestTotal: soloGuest.stayTotal }
        : result.plan,
  );
  const created: Array<{ id: string; propertyId: HouseId }> = [];
  for (const stay of toSave) {
    const row = await createReservation(env, {
      guestName: stay.guestName,
      propertyId: stay.propertyId,
      checkIn: stay.checkIn,
      checkOut: stay.checkOut,
      payout: stay.payout,
      ...(stay.guestTotal !== undefined ? { guestTotal: stay.guestTotal } : {}),
      source: stay.source,
      note: stay.note,
      status: 'confirmed',
      /*
       * The parts this stay occupies travel onto the saved reservation. Without this the booking would block nothing:
       * the blocking rules read `units` off the stay, and a part sold without it would read as the whole house to
       * everything downstream, which is the safe direction but would make the other two parts unsellable.
       */
      ...(stay.units && stay.units.length > 0 ? { units: stay.units } : {}),
    });
    created.push({ id: row.id, propertyId: row.propertyId });
  }
  const primary = created[0]!;
  // Read the holds before releasing them: whether one had already expired decides whether the host
  // needs to know those nights were never actually reserved.
  const holdsForRequest = await loadHolds(env)
    .then((rows) => rows.filter((row) => row.requestId === id && !row.released))
    .catch(() => []);
  // The hold has done its job, so it lets go now instead of timing out.
  await releaseHoldsForRequest(env, id).catch(() => 0);

  // A direct guest gets the same portal an OTA guest gets, so the house guide and the code work.
  // A two-house party stays in both houses, so each one gets its own link and its own guide.
  const origin = new URL(request.url).origin;
  const portalLinks: Array<{ propertyId: HouseId; link: string | null }> = [];
  let portalError: string | null = null;
  const guideOff: HouseId[] = [];
  for (const stay of created) {
    try {
      const on = await guideEnabled(env, stay.propertyId).catch(() => false);
      if (!on) guideOff.push(stay.propertyId);
      const survey = await upsertSurveyForStay(env, {
        id: stay.id,
        propertyId: stay.propertyId,
        guestName: saved.name ?? 'Guest',
        checkIn: result.plan.checkIn,
        checkOut: result.plan.checkOut,
      });
      portalLinks.push({ propertyId: stay.propertyId, link: surveyPublicUrl(origin, survey.token) });
      await updateReservation(env, stay.id, {
        surveyToken: survey.token,
        surveyChannel: 'none',
        ...(saved.email ? { guestEmail: saved.email } : {}),
      });
    } catch (err) {
      portalError = err instanceof Error ? err.message : 'The guest link could not be made.';
      portalLinks.push({ propertyId: stay.propertyId, link: null });
    }
  }
  const portalLink = portalLinks.find((row) => row.link)?.link ?? null;
  // A link to a house whose app is off is a dead end. Say so here instead of letting it look fine.
  const HOUSE_LABEL: Record<HouseId, string> = {
    river: 'the River House',
    ranch: 'the Ranch House',
    lindon: 'the Lindon House',
  };
  const offNames = guideOff.map((house) => HOUSE_LABEL[house]);
  /*
   * Where to find the link again.
   *
   * The accept message shows the guest page once, in a transient line that the next inbox load replaces. Email is the
   * usual way the guest receives it, and on this deployment email does not send at all — so a host who dismisses the line
   * has no link and no obvious way back. The Guests page has always carried it; nothing said so.
   */
  const portalNote = portalError
    ? `A guest link could not be made: ${portalError}`
    : offNames.length > 0
      ? `The guest app is off for ${offNames.join(' and ')}, so ${offNames.length === 1 ? 'that link' : 'those links'} will say the app is off. Turn it on in Guests before the guest arrives. The link stays on the Guests page.`
      : portalLinks.some((row) => row.link)
        ? 'The guest page stays on the Guests page, so you can copy it again after this message goes away.'
        : null;

  // The guest is told the stay is confirmed. A failed send leaves the booking in place.
  const mail = guestAcceptedMail({
    guestName: saved.name ?? 'Guest',
    houses: [result.plan.propertyId, ...(result.plan.alsoPropertyId ? [result.plan.alsoPropertyId] : [])],
    checkIn: result.plan.checkIn,
    checkOut: result.plan.checkOut,
    nights: result.plan.nights,
    ...(saved.guests !== undefined ? { guests: saved.guests } : {}),
    ...(saved.children !== undefined ? { children: saved.children } : {}),
  });
  // Each house gets its own page, labelled, so a two-house guest is not sent to only one guide.
  const HOUSE_NAME: Record<HouseId, string> = {
    river: 'The River House',
    ranch: 'The Ranch House',
    lindon: 'The Lindon House',
  };
  const links = portalLinks
    .filter((row): row is { propertyId: HouseId; link: string } => Boolean(row.link))
    .map((row) => `${HOUSE_NAME[row.propertyId]}: ${row.link}`);
  const mailBody = links.length > 0 ? `${mail.body}\n\n${links.length === 1 ? 'Your stay page' : 'Your stay pages'}:\n${links.join('\n')}` : mail.body;
  const to = (saved.email ?? '').trim();
  const sent =
    to.includes('@')
      ? await gmailSend(env, to, mail.subject, mailBody).catch((err) => ({
          error: err instanceof Error ? err.message : 'Guest mail failed',
        }))
      : { error: 'This request has no guest email, so no confirmation was sent.' };

  return corsJson(
    request,
    {
      ok: true,
      reservationId: primary.id,
      /** Both stays, so a two-house request can be checked house by house. */
      reservations: created,
      line: acceptedLine(result.plan),
      plan: result.plan,
      portalLink,
      /** One entry per house, so a two-house booking shows both pages. */
      portalLinks,
      portalError,
      portalNote,
      guideOn: guideOff.length === 0,
      guestEmailed: !sent.error,
      guestEmailError: sent.error,
      guestLine: sent.error ? null : sentLine('accepted', to),
      /*
       * The hold on a request can end before anyone answers, and accepting it later is still allowed.
       * That is fine, but those nights were never actually reserved, so the host should know another
       * request could have taken them in the gap rather than believing the dates were held.
       */
      holdLine: holdWarning(holdsForRequest, new Date()),
    },
    201,
    { 'Cache-Control': 'no-store' },
  );
};

/**
 * What to tell the host about the hold when a request is accepted.
 *
 * A request whose hold ended is still acceptable, and until now the accept said nothing about it. The
 * nights were not actually reserved during the gap, so a second guest could have asked for them; the
 * clash check catches that, but the host should know the dates were never held rather than assume.
 */
export function holdWarning(
  holds: readonly { expiresAt?: string; released?: boolean }[],
  now: Date,
): string | null {
  if (holds.length === 0) {
    return 'This request has no live hold. Those nights were never held, so check the calendar before you promise them.';
  }
  const live = holds.some((hold) => {
    if (hold.released === true) return false;
    const at = typeof hold.expiresAt === 'string' ? Date.parse(hold.expiresAt) : Number.NaN;
    return !Number.isNaN(at) && at > now.getTime();
  });
  return live ? null : 'The hold on this request had already ended, so those nights were not reserved while it sat. They were free for another guest to ask for.';
}

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
