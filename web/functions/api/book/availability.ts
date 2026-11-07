import { denverToday } from '../../../src/lib/market/dates';
import { publicCalendarFromLists } from '../../../src/lib/public-calendar';
import { loadCalendarBlocks } from '../../_lib/calendar-store';
import { corsJson } from '../../_lib/data';
import type { SettingsEnv } from '../../_lib/kv';
import { storageReadPaused } from '../../_lib/kv-json';
import { getAllReservations } from '../../_lib/reservations-store';
import { loadActiveHolds } from '../../_lib/hold-store';
import { loadApprovedRates } from '../../_lib/pricing-store';
import type { ApprovedRate } from '../../../src/lib/market/rate-sheet';

/** Public booked nights only. No guest names, payouts, or contact details. */
export const onRequestGet: PagesFunction<SettingsEnv> = async ({ request, env }) => {
  const from = denverToday();
  let stays;
  let blocks;
  let holds: Array<{ propertyId: string; checkIn: string; checkOut: string }> = [];
  // A sheet that could not be read stays null, so the page never shows a stand-in as approved.
  let approved: ApprovedRate[] | null = [];
  try {
    stays = await getAllReservations(env);
    blocks = await loadCalendarBlocks(env);
    holds = (await loadActiveHolds(env)).map((hold) => ({
      propertyId: hold.propertyId,
      checkIn: hold.checkIn,
      checkOut: hold.checkOut,
    }));
    try {
      approved = await loadApprovedRates(env);
    } catch {
      approved = null;
    }
  } catch (err) {
    if (storageReadPaused(err)) {
      return corsJson(request, {
        storageReads: 'paused',
        nights: null,
        closed: null,
        held: null,
        approved: null,
        error: 'Saved bookings could not be read. Nothing was written over them.',
      });
    }
    const message = err instanceof Error ? err.message : 'Calendar failed';
    return corsJson(request, { error: message }, 500);
  }
  return corsJson(request, publicCalendarFromLists(stays, blocks, from, holds, approved));
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
