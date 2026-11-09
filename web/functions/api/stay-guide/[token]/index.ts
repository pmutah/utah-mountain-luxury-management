import { corsJson, PROPERTIES } from '../../../_lib/data';
import { findSurveyByToken } from '../../../_lib/survey-store';
import { getAllReservations, loadCustomReservations, loadReservationOverrides } from '../../../_lib/reservations-store';
import { loadCalendarBlocks } from '../../../_lib/calendar-store';
import { accessWindow, GUIDE_HOUSE_IDS, loadGuides, type GuideHouseId } from '../../../_lib/guest-guide';
import { hostOnly } from '../../../_lib/auth';
import type { AgentEnv, ReservationRecord } from '../../../_lib/agent/types';
import { occupiedNights, type StaySpan } from '../../../../src/lib/availability';
import { nightBeforeIsFree, checkoutNightIsFree, stayNightFlags } from '../../../../src/lib/journey';
import { preferenceCardLines } from '../../../../src/lib/preference-choices';
import { stayAccessSecrets } from '../../../../src/lib/stay-rules';
import { addDays } from '../../../../src/lib/market/dates';
import { storageReadPaused } from '../../../_lib/kv-json';
import { noteChildCount, noteGuestCount } from '../../../../src/lib/note-party';
import type { GuestPreferenceAnswers } from '../../../_lib/survey-store';

function stayPartyFromAnswers(answers?: GuestPreferenceAnswers): { guests: number; children?: number } | null {
  if (!answers?.adults?.trim()) return null;
  const adults = Number(answers.adults.trim());
  if (!Number.isInteger(adults) || adults < 1 || adults > 30) return null;
  const kidRaw = answers.children?.trim();
  let children = 0;
  if (kidRaw) {
    const kids = Number(kidRaw);
    if (!Number.isInteger(kids) || kids < 0 || kids >= adults) return null;
    children = kids;
  }
  const guests = adults + children;
  if (guests < 1 || guests > 30) return null;
  return children > 0 ? { guests, children } : { guests };
}

export const onRequestGet: PagesFunction<AgentEnv & { DASHBOARD_PASSWORD?: string }> = async ({
  request,
  env,
  params,
}) => {
  const token = String(params.token ?? '');
  let survey;
  try {
    survey = await findSurveyByToken(env, token);
  } catch (err) {
    if (storageReadPaused(err)) {
      return corsJson(
        request,
        { error: 'Saved bookings could not be read. Nothing was written over them.', storageReads: 'paused' },
        503,
      );
    }
    const message = err instanceof Error ? err.message : 'Stay guide failed';
    return corsJson(request, { error: message }, 500);
  }
  if (!survey || !GUIDE_HOUSE_IDS.includes(survey.propertyId as GuideHouseId)) {
    return corsJson(request, { error: 'This link is not valid.' }, 404);
  }
  const houseId = survey.propertyId as GuideHouseId;
  let guide;
  try {
    guide = (await loadGuides(env))[houseId];
  } catch (err) {
    if (storageReadPaused(err)) {
      return corsJson(
        request,
        { error: 'The saved guide could not be read. Nothing was written over it.', storageReads: 'paused' },
        503,
      );
    }
    const message = err instanceof Error ? err.message : 'Stay guide failed';
    return corsJson(request, { error: message }, 500);
  }
  // A preview shows the door code early, so it needs a real host. `isAuthenticated` returns true
  // when DASHBOARD_PASSWORD is unset, which would have let anyone read the codes with ?preview=1.
  const wantsPreview = new URL(request.url).searchParams.get('preview') === '1';
  const preview = wantsPreview && hostOnly(request, env);
  if (!guide.enabled && !preview) {
    return corsJson(request, { enabled: false }, 200, { 'Cache-Control': 'no-store' });
  }

  let reservations;
  let blocks;
  let calendarPaused = false;
  try {
    reservations = await getAllReservations(env);
    blocks = await loadCalendarBlocks(env);
  } catch (err) {
    if (!storageReadPaused(err)) {
      const message = err instanceof Error ? err.message : 'Stay guide failed';
      return corsJson(request, { error: message }, 500);
    }
    calendarPaused = true;
  }
  const stay = reservations?.find((item) => item.id === survey.reservationId);
  if (stay?.status === 'cancelled') {
    return corsJson(request, { error: 'This stay was cancelled.' }, 410);
  }
  /*
   * A cancelled stay is filtered out of `getAllReservations` â€” correct for every calendar, and wrong
   * here: the lookup above misses, the route falls back to the survey's own dates, and a cancelled
   * stay went on serving its door code and Wi-Fi inside what looked like a live window. The 410 branch
   * existed but could never be reached. So cancellation is checked against the stored rows directly,
   * which is the only source that still holds a cancelled stay.
   */
  if (!stay) {
    const stored = await loadCustomReservations(env).catch(() => null);
    const overrides = await loadReservationOverrides(env).catch(
      () => ({}) as Record<string, Partial<ReservationRecord>>,
    );
    const storedRow = stored?.find((item) => item.id === survey.reservationId);
    const rowStatus = storedRow?.status ?? overrides[survey.reservationId]?.status;
    if (rowStatus === 'cancelled') {
      return corsJson(request, { error: 'This stay was cancelled.' }, 410);
    }
  }

  const checkIn = stay?.checkIn ?? survey.checkIn;
  const checkOut = stay?.checkOut ?? survey.checkOut;
  const partyFromForm = stayPartyFromAnswers(survey.answers);
  const partyGuests = partyFromForm?.guests ?? noteGuestCount(stay?.note) ?? undefined;
  const partyChildren = partyFromForm?.children ?? noteChildCount(stay?.note) ?? undefined;
  const window = accessWindow(checkIn, checkOut);
  const unlocked = window.open || preview;
  /*
   * Two different things are being checked here, and only one of them can be enforced by this route.
   *
   * `unlocked` is the **time window**: the code is withheld until the day before check-in and after checkout.
   * The server decides that, from the stay's dates, and it cannot be talked around.
   *
   * `ready` is the **"read the house rules first" step**, and this route cannot verify it. The guest app keeps
   * the acknowledgement in `sessionStorage` and asks for it with `?ready=1`, so a caller who holds a valid
   * token can assert readiness inside the window without having opened a single rule. That is a deliberate
   * trade — the token is the credential, and a stay agreement is not signed by reading a page — but it must
   * not be mistaken for server-enforced. Anyone who needs that guarantee has to withhold the code until a
   * record exists on the server, which this route does not do.
   */
  const ready = preview || new URL(request.url).searchParams.get('ready') === '1';
  const secrets = stayAccessSecrets({
    unlocked,
    ready,
    wifiName: guide.wifiName,
    wifiPassword: guide.wifiPassword,
    doorCode: guide.doorCode,
    doorNotes: guide.doorNotes,
  });
  const spans: StaySpan[] = [
    ...(reservations ?? []).map((item) => ({
      propertyId: item.propertyId,
      checkIn: item.checkIn,
      checkOut: item.checkOut,
      status: item.status,
    })),
    ...(blocks ?? []).map((block) => ({
      propertyId: block.propertyId,
      checkIn: block.start,
      checkOut: block.end,
    })),
  ];
  const flags = stayNightFlags(
    calendarPaused,
    nightBeforeIsFree(checkIn, occupiedNights(spans, houseId, addDays(checkIn, -1), checkIn)),
    checkoutNightIsFree(checkOut, occupiedNights(spans, houseId, checkOut, addDays(checkOut, 1))),
  );

  return corsJson(request, {
    enabled: guide.enabled,
    guestName: survey.guestName,
    propertyId: houseId,
    propertyName: PROPERTIES[houseId].name,
    /*
     * Which parts of the Riverhouse this stay occupies.
     *
     * Absent or empty means the whole house, so every stay recorded before the house was sold in parts reads exactly as
     * it did. A part guest needs this: without it the portal tells them the house sleeps 24 and says nothing about the
     * rest of the building being someone else's.
     */
    ...(Array.isArray(stay?.units) && stay.units.length > 0 ? { units: stay.units } : {}),
    checkIn,
    checkOut,
    ...(partyGuests !== undefined ? { partyGuests, ...(partyChildren !== undefined ? { partyChildren } : {}) } : {}),
    /*
     * A completed survey is not the same as having preferences. This stay's survey was submitted with
     * only `{ surveyVariant: 'vip' }` and no answers, yet `Boolean(completedAt)` reported done — so the
     * guest read "We have your preferences" in the journey and "This stay has no preference card yet"
     * on the same page, both visible, saying the opposite. The journey line now waits for a card that
     * actually carries answers, which is the same test the card section uses.
     */
    preferencesDone: preferenceCardLines(houseId, survey.answers ?? null).length > 0,
    hasSurvey: Boolean(survey.completedAt),
    storageReads: calendarPaused ? 'paused' : 'ok',
    nightBeforeFree: flags.nightBeforeFree,
    checkoutNightFree: flags.checkoutNightFree,
    access: {
      phase: window.phase,
      opensOn: window.opensOn,
      preview,
      unlocked,
      wifiName: secrets.wifiName,
      wifiPassword: secrets.wifiPassword,
      doorCode: secrets.doorCode,
      doorNotes: secrets.doorNotes,
    },
    guide: {
      headline: guide.headline,
      address: guide.address,
      checkInTime: guide.checkInTime,
      checkOutTime: guide.checkOutTime,
      parking: guide.parking,
      arrival: guide.arrival,
      checkout: guide.checkout,
      houseRules: guide.houseRules,
      contactPhone: guide.contactPhone,
      contactEmail: guide.contactEmail,
      emergency: guide.emergency,
      sections: guide.sections,
      videos: guide.videos,
      places: guide.places,
    },
  }, 200, { 'Cache-Control': 'no-store' });
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);


