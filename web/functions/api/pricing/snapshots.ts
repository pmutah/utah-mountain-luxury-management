import { hostDenied, hostOnly } from '../../_lib/auth';
import { corsJson } from '../../_lib/data';
import { addPriceSnapshot, loadCompSet, loadPriceSnapshots } from '../../_lib/pricing-store';
import { toLiveComp, toLiveSnaps, MAX_ASK_NIGHTS, type LiveComp } from '../../../src/lib/market/live';
import { storageReadPaused } from '../../_lib/kv-json';
import type { SettingsEnv } from '../../_lib/kv';

type HouseId = 'ranch' | 'lindon' | 'river';

function houseFrom(value: string | null): HouseId | null {
  return value === 'ranch' || value === 'lindon' || value === 'river' ? value : null;
}

/**
 * Saved comps and the asks they carry, for the market cards. Reading this writes nothing.
 * A paused store says so rather than returning an empty list that would look like no comps exist.
 */
export const onRequestGet: PagesFunction<SettingsEnv> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  const url = new URL(request.url);
  const house = houseFrom(url.searchParams.get('house'));
  const compId = url.searchParams.get('compId');
  let comps;
  let snaps;
  try {
    comps = await loadCompSet(env);
    snaps = await loadPriceSnapshots(env);
  } catch (err) {
    if (storageReadPaused(err)) {
      return corsJson(request, { liveComps: null, snaps: null, storageReads: 'paused' }, 503);
    }
    const message = err instanceof Error ? err.message : 'Comps failed';
    return corsJson(request, { error: message }, 500);
  }
  const liveComps: LiveComp[] = comps
    .filter((comp) => !house || !comp.propertyId || comp.propertyId === 'both' || comp.propertyId === house)
    .map((comp) => toLiveComp(comp))
    .filter((comp): comp is LiveComp => comp !== null);
  const ids = new Set(liveComps.map((comp) => comp.id));
  const filtered = toLiveSnaps(snaps).filter(
    (snap) => ids.has(snap.compId) && (!compId || snap.compId === compId),
  );
  return corsJson(
    request,
    { liveComps, snaps: filtered.slice(-500), storageReads: 'ok' },
    200,
    { 'Cache-Control': 'no-store' },
  );
};

/** The most asks one save may carry, so a paste cannot fill the store. */
const MAX_ASKS = MAX_ASK_NIGHTS;

/**
 * Record one observed ask for a saved comp on one night. Without this the live band could never
 * activate: a comp sets the band only for a night that carries a saved ask, and nothing else writes
 * one. The guest ask is what a comp actually lists, not what it earns.
 */
export const onRequestPost: PagesFunction<SettingsEnv> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  let body: { compId?: unknown; asks?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return corsJson(request, { error: 'Invalid JSON' }, 400);
  }
  const compId = typeof body.compId === 'string' ? body.compId.trim() : '';
  if (!compId) return corsJson(request, { error: 'A comp id is required.' }, 400);
  if (!Array.isArray(body.asks) || body.asks.length === 0) {
    return corsJson(request, { error: 'At least one night and rate are required.' }, 400);
  }
  if (body.asks.length > MAX_ASKS) {
    return corsJson(request, { error: `Save at most ${MAX_ASKS} nights at a time.` }, 400);
  }
  // The comp has to be one we saved, so an ask cannot attach itself to nothing.
  let comps;
  try {
    comps = await loadCompSet(env);
  } catch (err) {
    if (storageReadPaused(err)) {
      return corsJson(request, { error: 'Saved comps could not be read. Nothing was written.' }, 503);
    }
    throw err;
  }
  if (!comps.some((comp) => comp.id === compId)) {
    return corsJson(request, { error: 'That comp is not on the list. Save the comp first.' }, 404);
  }

  // Every row is checked before any is written, so a bad night does not half-save a set.
  const accepted = toLiveSnaps(body.asks.map((row) => (row && typeof row === 'object' ? { ...(row as object), compId } : row)));
  if (accepted.length !== body.asks.length) {
    return corsJson(
      request,
      { error: 'Every night needs a real date and a rate above zero. Nothing was written.' },
      400,
    );
  }
  let saved = 0;
  try {
    for (const snap of accepted) {
      await addPriceSnapshot(env, { compId, date: snap.date, nightlyRate: snap.nightlyRate, source: 'manual' });
      saved += 1;
    }
  } catch (err) {
    if (storageReadPaused(err)) {
      return corsJson(request, { error: 'The snapshots could not be written.', saved }, 503);
    }
    throw err;
  }
  return corsJson(request, { ok: true, saved, compId }, 201, { 'Cache-Control': 'no-store' });
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
