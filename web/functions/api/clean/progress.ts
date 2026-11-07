import { corsJson } from '../../_lib/data';
import { hostDenied, hostOnly } from '../../_lib/auth';
import { progressSince } from '../../_lib/clean-progress-store';
import { buildTurnovers } from '../../../src/lib/today';
import { getAllReservations } from '../../_lib/reservations-store';
import { progressSummary } from '../../../src/lib/clean-progress';
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

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
