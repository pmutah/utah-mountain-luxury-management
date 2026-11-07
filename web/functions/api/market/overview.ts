import { corsJson } from '../../_lib/data';
import { buildMarketBoard } from '../../../src/lib/market/board';
import { denverToday } from '../../../src/lib/market/dates';
import { loadLiveNights, loadApprovedRates } from '../../_lib/pricing-store';
import { storageReadPaused } from '../../_lib/kv-json';
import type { SettingsEnv } from '../../_lib/kv';

function houseFrom(value: string | null) {
  if (value === 'ranch' || value === 'lindon' || value === 'river') return value;
  return 'river';
}

/**
 * The market board. Saved comps with a sleep count and a distance, and the asks they carry, set the
 * band. A night with no saved ask keeps the sample, and the board says which it used.
 */
export const onRequestGet: PagesFunction<SettingsEnv> = async ({ request, env }) => {
  const url = new URL(request.url);
  const house = houseFrom(url.searchParams.get('house'));
  const from = denverToday();
  const days = Math.min(180, Math.max(7, Number(url.searchParams.get('days')) || 90));
  let live = null;
  let storageReads: 'ok' | 'paused' = 'ok';
  // Approved nights, so the board a host reads starts from the published price rather than the card.
  let approved: Array<{ house: string; date: string; guest: number }> = [];
  try {
    live = await loadLiveNights(env, house, from, days);
    approved = (await loadApprovedRates(env)).map((row) => ({ house: row.house, date: row.date, guest: row.guest }));
  } catch (err) {
    if (!storageReadPaused(err)) throw err;
    storageReads = 'paused';
  }
  const board = buildMarketBoard(
    house,
    from,
    days,
    undefined,
    live ? live : null,
    approved.filter((row) => row.house === house).map((row) => ({ date: row.date, guest: row.guest })),
  );
  return corsJson(
    request,
    { ...board, storageReads },
    200,
    { 'Cache-Control': 'no-store' },
  );
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
