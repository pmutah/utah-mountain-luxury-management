import { hostDenied, hostOnly } from '../../_lib/auth';
import { corsJson } from '../../_lib/data';
import { getAllReservations, updateReservation } from '../../_lib/reservations-store';
import { loadSurveys, upsertSurveyForStay } from '../../_lib/survey-store';
import { surveyPublicUrl } from '../../_lib/survey-copy';
import { guideEnabled } from '../../_lib/guest-guide';
import { storageReadPaused } from '../../_lib/kv-json';
import type { AgentEnv, PropertyId } from '../../_lib/agent/types';

/**
 * Give every upcoming stay a guest portal link.
 *
 * The portal link was only ever minted in two places — accepting a direct request, and the host
 * sending a survey by email or text — so a stay imported from Airbnb or VRBO had **no link and no
 * way to get one except opening that stay and pressing send to a guest**. On 2026-11-08 production
 * held 87 real bookings and **zero** portal tokens, which is why the guest portal looked built but no
 * guest had ever been able to open it.
 *
 * This backfills the missing links and **sends nothing**. `channel` is recorded as `none`, which is
 * already a supported value, so the guest list can show a link for the host to copy and no message
 * goes out. Sending is still a separate, deliberate act.
 *
 * It is safe to run repeatedly: `upsertSurveyForStay` returns the existing survey's token for a stay,
 * so a second run changes nothing and cannot mint a duplicate or move a guest's link.
 *
 * Writes are batched. Both stores are whole-list values, and Cloudflare allows one write per key per
 * second — an earlier per-night loop is exactly how a save half-applied on this project.
 */
export const onRequestPost: PagesFunction<AgentEnv> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);

  const origin = new URL(request.url).origin;
  const today = new Date().toISOString().slice(0, 10);

  let stays;
  let surveys;
  try {
    [stays, surveys] = await Promise.all([getAllReservations(env), loadSurveys(env)]);
  } catch (err) {
    if (storageReadPaused(err)) {
      return corsJson(
        request,
        { error: 'Saved bookings could not be read. Nothing was written.', minted: 0, skipped: 0 },
        503,
      );
    }
    const message = err instanceof Error ? err.message : 'The stays could not be read.';
    return corsJson(request, { error: message, minted: 0, skipped: 0 }, 500);
  }

  /*
   * Only stays a guest can actually use a link for: not cancelled, not a block, and not already over.
   * A finished stay's portal is not something to hand anybody. `?include=all` exists for a host who
   * deliberately wants the past backfilled.
   */
  const includePast = new URL(request.url).searchParams.get('include') === 'all';
  const candidates = stays.filter(
    (stay) => stay.status !== 'cancelled' && stay.status !== 'blocked' && (includePast || stay.checkOut >= today),
  );

  const alreadyMinted = new Set(surveys.map((survey) => survey.reservationId));
  const minted: Array<{ reservationId: string; propertyId: string; checkIn: string; link: string }> = [];
  const skipped: Array<{ reservationId: string; reason: string }> = [];
  /** Stays whose reservation row still needs the token written back to it. */
  const needingToken = new Set<string>();

  for (const stay of candidates) {
    if (stay.surveyToken && alreadyMinted.has(stay.id)) {
      skipped.push({ reservationId: stay.id, reason: 'already has a link' });
      continue;
    }
    try {
      const survey = await upsertSurveyForStay(env, {
        id: stay.id,
        propertyId: stay.propertyId as PropertyId,
        guestName: stay.guestName ?? 'Guest',
        checkIn: stay.checkIn,
        checkOut: stay.checkOut,
        confirmationCode: stay.confirmationCode,
      });
      minted.push({
        reservationId: stay.id,
        propertyId: stay.propertyId,
        checkIn: stay.checkIn,
        link: surveyPublicUrl(origin, survey.token),
      });
      if (stay.surveyToken !== survey.token) needingToken.add(stay.id);
    } catch (err) {
      skipped.push({
        reservationId: stay.id,
        reason: err instanceof Error ? err.message : 'the link could not be made',
      });
    }
  }

  /*
   * The survey store is written by `upsertSurveyForStay` only when the variant or confirmation code
   * changed, so a repeat run performs no survey writes at all.
   *
   * The token goes onto the reservation row in a second pass, after the survey saves, so the token
   * exists before anything points at it. Only the missing tokens are written; a row that already has
   * one is never touched, because overwriting a live link would move a guest's page out from under
   * them.
   */
  const tokenByStay = new Map<string, string>();
  if (needingToken.size > 0) {
    try {
      const fresh = await loadSurveys(env);
      for (const survey of fresh) {
        if (needingToken.has(survey.reservationId)) tokenByStay.set(survey.reservationId, survey.token);
      }
      for (const [id, token] of tokenByStay) {
        await updateReservation(env, id, { surveyToken: token, surveyChannel: 'none' });
      }
    } catch {
      // The links above still open. The row patch only saves the guest list a lookup.
    }
  }

  const byHouse: Record<string, number> = {};
  for (const row of minted) byHouse[row.propertyId] = (byHouse[row.propertyId] ?? 0) + 1;
  const guideOff = new Set<string>();
  for (const house of Object.keys(byHouse)) {
    if (!(await guideEnabled(env, house).catch(() => false))) guideOff.add(house);
  }

  return corsJson(
    request,
    {
      ok: true,
      /** Nothing is sent by this route. Recorded so a host never mistakes it for a send. */
      sent: 0,
      minted: minted.length,
      skipped: skipped.length,
      byHouse,
      /** Houses whose app is off, so the link above opens a page with the guide unavailable. */
      guideOff: [...guideOff],
      links: minted,
      skippedRows: skipped,
    },
    200,
    { 'Cache-Control': 'no-store' },
  );
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
