import { corsJson } from '../../_lib/data';
import { hostDenied, hostOnly } from '../../_lib/auth';
import { progressSince, putProgress } from '../../_lib/clean-progress-store';
import { buildTurnovers } from '../../../src/lib/today';
import { getAllReservations } from '../../_lib/reservations-store';
import { keepDone, progressSummary } from '../../../src/lib/clean-progress';
import { storageReadPaused } from '../../_lib/kv-json';
import { denverToday } from '../../../src/lib/market/dates';
import type { HouseId } from '../../../src/lib/market/types';
import type { SettingsEnv } from '../../_lib/kv';

type Env = SettingsEnv & { DASHBOARD_PASSWORD?: string };

const HOUSES: string[] = ['river', 'ranch', 'lindon'];

function isHouse(id: string): id is HouseId {
  return HOUSES.includes(id);
}

/** Host only. What the cleaners have ticked, for the next two weeks. It books nothing. */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  const today = denverToday();
  let progress;
  let turns: Array<{ house: HouseId; checkout: string; sameDay: boolean }>;
  try {
    progress = await progressSince(env, today);
  } catch (err) {
    if (storageReadPaused(err)) {
      return corsJson(request, { progress: null, summary: null, storageReads: 'paused' }, 503);
    }
    const message = err instanceof Error ? err.message : 'Clean progress failed';
    return corsJson(request, { error: message }, 500);
  }
  try {
    const stays = await getAllReservations(env);
    turns = buildTurnovers(stays as never, today, 14)
      .filter((turn) => isHouse(String(turn.house)))
      .map((turn) => ({ house: turn.house as HouseId, checkout: turn.checkout, sameDay: turn.gapNights === 0 }));
  } catch (err) {
    if (!storageReadPaused(err)) {
      const message = err instanceof Error ? err.message : 'Clean turns failed';
      return corsJson(request, { error: message }, 500);
    }
    // The ticks are still real even when the turn list could not be read.
    return corsJson(
      request,
      { progress, summary: null, storageReads: 'paused' },
      200,
      { 'Cache-Control': 'no-store' },
    );
  }
  return corsJson(
    request,
    { progress, summary: progressSummary(turns, progress), storageReads: 'ok' },
    200,
    { 'Cache-Control': 'no-store' },
  );
};

/**
 * Host side of the same tick.
 *
 * The desk's checkboxes wrote to `sessionStorage`, so a host ticking a step changed nothing: the count and the line
 * beside it both read the server, and the box was decorative. Measured on production — tick a box, `0 of 7` before
 * and `0 of 7` after.
 *
 * Rather than teach the desk to read two stores, the desk now **writes to the one the cleaner writes to**. The
 * validation is deliberately the same rule: only a turn that is actually on the list, and only the step ids that turn
 * has. That is what stops a host's browser and a cleaner's phone from holding different truths about the same house on
 * the same day.
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
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

  const today = denverToday();
  let sameDay: boolean | null = null;
  try {
    const stays = await getAllReservations(env);
    const turn = buildTurnovers(stays as never, today, 14).find(
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
    return corsJson(request, { error: 'That turnover is not on the list.' }, 404);
  }

  const next = keepDone(house, checkout, sameDay, body.done);
  if (!next) return corsJson(request, { error: 'That turnover is not on the list.' }, 404);
  const rows = await putProgress(env, next);
  return corsJson(request, { ok: true, progress: rows }, 200, { 'Cache-Control': 'no-store' });
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
