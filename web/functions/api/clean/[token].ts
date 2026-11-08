import { corsJson } from '../../_lib/data';
import { isCleanToken, cleanJobView, cleanPageNote, sortCleanJobs, type CleanJobView } from '../../../src/lib/clean-link';
import { findCleanLink, stampCleanView } from '../../_lib/clean-link-store';
import { progressSince, putProgress } from '../../_lib/clean-progress-store';
import { keepDone, type CleanProgress } from '../../../src/lib/clean-progress';
import { buildTurnovers } from '../../../src/lib/today';
import { getAllReservations } from '../../_lib/reservations-store';
import { storageReadPaused } from '../../_lib/kv-json';
import { denverToday } from '../../../src/lib/market/dates';
import type { HouseId } from '../../../src/lib/market/types';
import type { SettingsEnv } from '../../_lib/kv';

const HOUSES: HouseId[] = ['river', 'ranch', 'lindon'];

function isHouse(id: string): id is HouseId {
  return HOUSES.includes(id as HouseId);
}

/**
 * What a cleaner sees. The link is the whole credential, so this route returns the house, the day,
 * the steps, and how to get in. Guest names, payouts, and the door code stay off it.
 */
export const onRequestGet: PagesFunction<SettingsEnv> = async ({ request, env, params }) => {
  const token = String(params.token ?? '');
  if (!isCleanToken(token)) return corsJson(request, { error: 'This clean link is not valid.' }, 404);
  let link;
  try {
    link = await findCleanLink(env, token);
  } catch (err) {
    /*
     * A failed read is **not** an invalid link.
     *
     * This used to be `.catch(() => null)`, so any storage hiccup became "This clean link is not valid." Measured on
     * production on a token minted seconds earlier: `404, 404, 404, 200, 404, 200, 404, 404` across eight identical
     * reads. A cleaner standing in a driveway was told their link was bad most of the time, when the link was fine and
     * the read had failed.
     *
     * The two cases are now separate: 503 says "try again", 404 says "this link does not exist". Telling a person
     * their credential is invalid when the store was merely slow is the kind of error that makes them stop trusting
     * the whole page.
     */
    if (storageReadPaused(err)) {
      return corsJson(
        request,
        { error: 'The clean links could not be read just now. This is not a bad link — try again in a moment.', storageReads: 'paused' },
        503,
      );
    }
    return corsJson(
      request,
      { error: 'The clean links could not be read just now. This is not a bad link — try again in a moment.' },
      503,
    );
  }
  if (!link) return corsJson(request, { error: 'This clean link is not valid.' }, 404);

  const lang = new URL(request.url).searchParams.get('lang') === 'es' ? 'es' : 'en';
  let jobs: CleanJobView[] = [];
  let unread = false;
  try {
    const stays = await getAllReservations(env);
    const turnovers = buildTurnovers(stays as never, denverToday(), 14);
    jobs = sortCleanJobs(
      turnovers.flatMap((turn) => {
        if (!isHouse(String(turn.house))) return [];
        const view = cleanJobView({
          house: turn.house as HouseId,
          checkout: turn.checkout,
          gapNights: turn.gapNights,
          lang,
        });
        return view ? [view] : [];
      }),
    );
  } catch (err) {
    if (!storageReadPaused(err)) {
      const message = err instanceof Error ? err.message : 'Clean jobs failed';
      return corsJson(request, { error: message }, 500);
    }
    unread = true;
  }

  void stampCleanView(env, token).catch(() => undefined);
  // The ticks ride with the job list so the page can show what is already done.
  let progress: CleanProgress[];
  try {
    progress = await progressSince(env, denverToday());
  } catch {
    progress = [];
  }
  return corsJson(
    request,
    {
      jobs,
      progress,
      note: cleanPageNote(jobs, unread, lang),
      lang,
      storageReads: unread ? 'paused' : 'ok',
      // The label is the host's note to themselves, so it stays off the cleaner's page.
      since: link.createdAt,
    },
    200,
    { 'Cache-Control': 'no-store' },
  );
};

/**
 * Tick or untick one step. The link is the credential, and only ids this turn actually has are
 * accepted. It writes a tick, not a booking, and it cannot reach another house.
 */
export const onRequestPost: PagesFunction<SettingsEnv> = async ({ request, env, params }) => {
  const token = String(params.token ?? '');
  if (!isCleanToken(token)) return corsJson(request, { error: 'This clean link is not valid.' }, 404);
  let link;
  try {
    link = await findCleanLink(env, token);
  } catch (err) {
    if (storageReadPaused(err)) {
      return corsJson(request, { error: 'The clean links could not be read. Nothing was written.', storageReads: 'paused' }, 503);
    }
    throw err;
  }
  if (!link) return corsJson(request, { error: 'This clean link is not valid.' }, 404);

  let body: { house?: unknown; checkout?: unknown; done?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return corsJson(request, { error: 'Invalid JSON' }, 400);
  }
  const house = typeof body.house === 'string' ? body.house : '';
  const checkout = typeof body.checkout === 'string' ? body.checkout : '';
  if (!isHouse(house)) return corsJson(request, { error: 'A house is required.' }, 400);
  if (!Array.isArray(body.done)) return corsJson(request, { error: 'A list of done steps is required.' }, 400);

  // The tick only counts for a turn that is actually on the cleaner's list.
  let sameDay: boolean | null = null;
  try {
    const stays = await getAllReservations(env);
    const turn = buildTurnovers(stays as never, denverToday(), 14).find(
      (row) => row.house === house && row.checkout === checkout,
    );
    if (turn) sameDay = turn.gapNights === 0;
  } catch (err) {
    if (storageReadPaused(err)) {
      return corsJson(request, { error: 'Saved bookings could not be read. Nothing was written.' }, 503);
    }
    throw err;
  }
  if (sameDay === null) {
    return corsJson(request, { error: 'That turnover is not on the list for this link.' }, 404);
  }

  const next = keepDone(house, checkout, sameDay, body.done);
  if (!next) return corsJson(request, { error: 'That turnover is not on the list for this link.' }, 404);
  const rows = await putProgress(env, next);
  return corsJson(request, { ok: true, progress: rows }, 200, { 'Cache-Control': 'no-store' });
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
