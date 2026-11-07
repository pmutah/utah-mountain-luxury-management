import { corsJson } from '../../_lib/data';
import { hostDenied, hostOnly } from '../../_lib/auth';
import { photoLabel, photoLine } from '../../../src/lib/clean-photos';
import { photosSince } from '../../_lib/clean-photo-store';
import { buildTurnovers } from '../../../src/lib/today';
import { getAllReservations } from '../../_lib/reservations-store';
import { storageReadPaused } from '../../_lib/kv-json';
import { denverToday } from '../../../src/lib/market/dates';
import type { HouseId } from '../../../src/lib/market/types';
import type { SettingsEnv } from '../../_lib/kv';

type Env = SettingsEnv & { DASHBOARD_PASSWORD?: string };

const HOUSES: string[] = ['river', 'ranch', 'lindon'];

function isHouse(id: string): id is HouseId {
  return HOUSES.includes(id);
}

/**
 * Host only. Every room photo a cleaner uploaded for the next two weeks, grouped by turn, so the
 * desk can count them against the photo step. A photo carries a time and no guest name.
 */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  const today = denverToday();
  let photos;
  try {
    photos = await photosSince(env, today);
  } catch (err) {
    if (storageReadPaused(err)) return corsJson(request, { turns: null, storageReads: 'paused' }, 503);
    const message = err instanceof Error ? err.message : 'Photos failed';
    return corsJson(request, { error: message }, 500);
  }

  // Only a turn that is actually on the desk counts, so a stale row cannot add a photo.
  const turns: Record<string, Array<{ path: string; label: string; url: string }>> = {};
  const counts: Record<string, string> = {};
  try {
    const stays = await getAllReservations(env);
    const live = buildTurnovers(stays as never, today, 14).filter((turn) => isHouse(String(turn.house)));
    for (const turn of live) {
      const key = `${turn.house}:${turn.checkout}`;
      const onTurn = photos.filter((photo) => photo.house === turn.house && photo.checkout === turn.checkout);
      turns[key] = onTurn.map((photo) => ({
        path: photo.path,
        label: photoLabel(photo),
        url: `/api/clean/photo?path=${encodeURIComponent(photo.path)}`,
      }));
      counts[key] = photoLine(onTurn.length);
    }
  } catch (err) {
    if (!storageReadPaused(err)) {
      const message = err instanceof Error ? err.message : 'Turns failed';
      return corsJson(request, { error: message }, 500);
    }
    // The photo rows are still real even when the turn list could not be read.
    for (const photo of photos) {
      const key = `${photo.house}:${photo.checkout}`;
      (turns[key] ??= []).push({
        path: photo.path,
        label: photoLabel(photo),
        url: `/api/clean/photo?path=${encodeURIComponent(photo.path)}`,
      });
      counts[key] = photoLine(turns[key]!.length);
    }
    return corsJson(request, { turns, counts, storageReads: 'paused' }, 200, { 'Cache-Control': 'no-store' });
  }

  return corsJson(request, { turns, counts, storageReads: 'ok' }, 200, { 'Cache-Control': 'no-store' });
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
