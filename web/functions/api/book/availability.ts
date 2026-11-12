import { denverToday } from '../../../src/lib/market/dates';
import { publicCalendarFromLists } from '../../../src/lib/public-calendar';
import { loadCalendarBlocks } from '../../_lib/calendar-store';
import { corsJson } from '../../_lib/data';
import type { SettingsEnv } from '../../_lib/kv';
import { storageReadPaused } from '../../_lib/kv-json';
import { getAllReservations } from '../../_lib/reservations-store';
import { loadActiveHolds } from '../../_lib/hold-store';
import { loadApprovedRates, loadRiverUnitRates } from '../../_lib/pricing-store';
import { cacheKey, cachedCalendar } from '../../_lib/public-calendar-cache';
import type { RiverUnitRates } from '../../../src/lib/river-unit-rates';
import type { ApprovedRate } from '../../../src/lib/market/rate-sheet';

/** The assembled calendar. Public, and identical for every guest, which is what makes it cacheable. */
async function buildCalendar(env: SettingsEnv, from: string): Promise<unknown> {
  const stays = await getAllReservations(env);
  const blocks = await loadCalendarBlocks(env);
  const holds = (await loadActiveHolds(env)).map((hold) => ({
    propertyId: hold.propertyId,
    checkIn: hold.checkIn,
    checkOut: hold.checkOut,
  }));
  // A sheet that could not be read stays null, so the page never shows a stand-in as approved.
  let approved: ApprovedRate[] | null = [];
  /*
   * The Riverhouse part prices. Null on a read failure, so the page says the parts could not be read rather than
   * concluding the house has no parts for sale.
   */
  let unitRates: RiverUnitRates | null = null;
  try {
    approved = await loadApprovedRates(env);
  } catch {
    approved = null;
  }
  try {
    unitRates = await loadRiverUnitRates(env);
  } catch {
    unitRates = null;
  }
  return publicCalendarFromLists(stays, blocks, from, holds, approved, unitRates);
}

/** Public booked nights only. No guest names, payouts, or contact details. */
export const onRequestGet: PagesFunction<SettingsEnv> = async ({ request, env }) => {
  const from = denverToday();
  let payload;
  try {
    /*
     * One build per minute per isolate instead of six KV reads per visitor.
     *
     * This route is the guest site's whole source of truth for dates, and it was re-reading six keys for every page
     * load. Production hit its daily KV limit on 2026-11-12 and answered `paused`, which meant the public booking page
     * could not quote anything — the site was up and unable to take a booking. The payload is public and identical for
     * every guest, so it is cached for a minute in module memory.
     *
     * A booking request re-reads the calendar before it holds anything, so a stale minute here cannot double-book; the
     * worst case is a guest briefly seeing a just-taken night as free.
     */
    payload = (await cachedCalendar(cacheKey(from), () => buildCalendar(env, from))).value;
  } catch (err) {
    if (storageReadPaused(err)) {
      return corsJson(request, {
        storageReads: 'paused',
        nights: null,
        closed: null,
        held: null,
        approved: null,
        units: null,
        error: 'Saved bookings could not be read. Nothing was written over them.',
      });
    }
    const message = err instanceof Error ? err.message : 'Calendar failed';
    return corsJson(request, { error: message }, 500);
  }
  /*
   * A short public cache as well as the in-isolate one, so a guest's browser and Cloudflare's edge can absorb repeat
   * views of the same minute. `stale-while-revalidate` lets a slightly old calendar be shown while a fresh one is
   * fetched, which is the right trade for availability: a minute old is honest, and a failed fetch should not blank the
   * calendar a guest is looking at.
   */
  return corsJson(request, payload, 200, { 'Cache-Control': 'public, max-age=30, stale-while-revalidate=60' });
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
