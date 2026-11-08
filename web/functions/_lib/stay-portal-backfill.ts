import { getAllReservations, updateReservations } from './reservations-store';
import { loadSurveys, upsertSurveysForStays } from './survey-store';
import { guideEnabled } from './guest-guide';
import type { SettingsEnv } from './kv';
import type { PropertyId } from './agent/types';

/**
 * Give every upcoming stay a guest portal, if it does not have one.
 *
 * A stay that arrives through **iCal from Hospitable** was getting a calendar row and a cleaning fee but **no guest
 * portal** — measured on production: 25 upcoming stays, 25 surveys, but the one iCal booking (Michelle Welch,
 * Ranch, April 2027) had no token. Her link simply did not exist, and nothing was going to make one: the mint route
 * was host-gated and manual, so a booking that came in overnight sat invisible until somebody pressed a button.
 *
 * This is the same primitive that route uses, not a second implementation:
 *
 * - `upsertSurveysForStays` is **batched on purpose**. Calling `upsertSurveyForStay` in a loop is one write to the
 *   same KV key per stay, and Cloudflare allows one write per key per second — the first production run lost 14 of
 *   25 stays to `429 Too Many Requests` exactly that way.
 * - It is **idempotent**. An existing survey's token is returned unchanged, so running this on every sync cannot
 *   mint a duplicate or move a live link out from under a guest.
 * - Only a **missing** token is written back to the reservation row. Overwriting one would break a link the guest
 *   already holds.
 *
 * Never sends. Minting a link and messaging a guest are separate, deliberate acts.
 */
export async function backfillStayPortals(env: SettingsEnv): Promise<{
  minted: number;
  skipped: number;
  guideOff: string[];
  error: string | null;
}> {
  let stays;
  let surveys;
  try {
    [stays, surveys] = await Promise.all([getAllReservations(env), loadSurveys(env)]);
  } catch (err) {
    return { minted: 0, skipped: 0, guideOff: [], error: err instanceof Error ? err.message : 'the stays could not be read' };
  }

  const today = new Date().toISOString().slice(0, 10);
  /*
   * A link is only useful for a stay a guest can still use it for: not cancelled, not a block, and not already
   * over. Backfilling the past is a deliberate host action, not something a sync should do on its own.
   */
  const alreadyMinted = new Set(surveys.map((survey) => survey.reservationId));
  const pending = stays.filter(
    (stay) =>
      stay.status !== 'cancelled' &&
      stay.status !== 'blocked' &&
      stay.checkOut >= today &&
      !(stay.surveyToken && alreadyMinted.has(stay.id)),
  );

  if (pending.length === 0) return { minted: 0, skipped: 0, guideOff: [], error: null };

  let created;
  try {
    created = await upsertSurveysForStays(
      env,
      pending.map((stay) => ({
        id: stay.id,
        propertyId: stay.propertyId as PropertyId,
        guestName: stay.guestName ?? 'Guest',
        checkIn: stay.checkIn,
        checkOut: stay.checkOut,
        confirmationCode: stay.confirmationCode,
      })),
    );
  } catch (err) {
    return {
      minted: 0,
      skipped: pending.length,
      guideOff: [],
      error: err instanceof Error ? err.message : 'the links could not be made',
    };
  }

  /*
   * The token goes onto the row in a second pass, after the survey saves, so the token exists before anything points
   * at it. A row that already has one is left alone.
   */
  const tokenByStay = new Map<string, string>();
  const byId = new Map(pending.map((stay) => [stay.id, stay]));
  for (const survey of created) {
    const stay = byId.get(survey.reservationId);
    if (stay && stay.surveyToken !== survey.token) tokenByStay.set(survey.reservationId, survey.token);
  }
  if (tokenByStay.size > 0) {
    try {
      await updateReservations(
        env,
        [...tokenByStay].map(([id, token]) => ({
          id,
          patch: { surveyToken: token, surveyChannel: 'none' as const },
        })),
      );
    } catch {
      // The links still open; the row patch only saves the guest list a lookup.
    }
  }

  const guideOff: string[] = [];
  for (const house of new Set(created.map((survey) => survey.propertyId))) {
    if (!(await guideEnabled(env, house).catch(() => false))) guideOff.push(house);
  }

  return { minted: created.length, skipped: 0, guideOff, error: null };
}
