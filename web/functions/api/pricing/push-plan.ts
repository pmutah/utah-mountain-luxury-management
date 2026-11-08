import { corsJson } from '../../_lib/data';
import { hostDenied, hostOnly } from '../../_lib/auth';
import { buildMarketBoard } from '../../../src/lib/market/board';
import { runShadow } from '../../../src/lib/market/shadow';
import { planClimb, planLines, planProvenance, pushPayload, pushPlanAll, pushSendState, pushSummaryLine, type PushGate } from '../../../src/lib/market/push';
import { shadowClockFromSaved, type SavedShadowDay } from '../../../src/lib/market/shadow-log';
import { getAllReservations } from '../../_lib/reservations-store';
import { loadCalendarBlocks } from '../../_lib/calendar-store';
import { loadLiveNights, loadApprovedRates } from '../../_lib/pricing-store';
import { kvGet, storageReadPaused } from '../../_lib/kv-json';
import { denverToday } from '../../../src/lib/market/dates';
import { grossPace } from '../../../src/lib/revenue-goals';
import type { YearPace } from '../../../src/lib/market/fill';
import { occupiedNights, type StaySpan } from '../../../src/lib/availability';
import type { HouseId } from '../../../src/lib/market/types';
import type { SettingsEnv } from '../../_lib/kv';

const HOUSES: HouseId[] = ['river', 'ranch', 'lindon'];

type Env = SettingsEnv & { DASHBOARD_PASSWORD?: string; HOSPITABLE_WRITE_TOKEN?: string };

/**
 * What a rate push would change, house by house. It reads the board, the calendar, and the saved
 * shadow days, then hands back a plan. It never sends: there is no writer here on purpose, so this
 * route cannot change a price even if every gate is open.
 */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  const today = denverToday();
  const days = Math.min(180, Math.max(7, Number(new URL(request.url).searchParams.get('days')) || 90));

  let stays;
  let blocks;
  let saved: SavedShadowDay[];
  // The approved sheet, so the board starts from the price that is actually published rather than the
  // card. Without it the plan re-proposes nights the host already set.
  let approved: Array<{ house: string; date: string; guest: number }> = [];
  try {
    stays = await getAllReservations(env);
    blocks = await loadCalendarBlocks(env);
    saved = await kvGet<SavedShadowDay[]>(env, 'shadowDays', []);
    approved = (await loadApprovedRates(env)).map((row) => ({ house: row.house, date: row.date, guest: row.guest }));
  } catch (err) {
    if (storageReadPaused(err)) {
      return corsJson(request, { plans: null, summary: null, storageReads: 'paused' }, 503);
    }
    const message = err instanceof Error ? err.message : 'Push plan failed';
    return corsJson(request, { error: message }, 500);
  }

  const spans: StaySpan[] = [
    ...stays.map((stay) => ({
      propertyId: stay.propertyId,
      checkIn: stay.checkIn,
      checkOut: stay.checkOut,
      status: stay.status,
    })),
    ...blocks.map((block) => ({
      propertyId: block.propertyId,
      checkIn: block.start,
      checkOut: block.end,
    })),
  ];

  const clock = shadowClockFromSaved(saved, today);
  const gate: PushGate = {
    shadowReady: clock.ready,
    hasToken: Boolean(env.HOSPITABLE_WRITE_TOKEN),
    paused: false,
    calendarReady: true,
  };

  const plans = [];
  for (const house of HOUSES) {
    let live: Awaited<ReturnType<typeof loadLiveNights>> | null;
    try {
      live = await loadLiveNights(env, house, today, days);
    } catch {
      live = null;
    }
    const board = buildMarketBoard(
      house,
      today,
      days,
      undefined,
      live,
      approved.filter((row) => row.house === house).map((row) => ({ date: row.date, guest: row.guest })),
    );
    const taken = occupiedNights(spans, house, today, `${today.slice(0, 4)}-12-31`);
    const closed = occupiedNights(
      blocks.map((block) => ({
        propertyId: block.propertyId,
        checkIn: block.start,
        checkOut: block.end,
      })),
      house,
      today,
      `${today.slice(0, 4)}-12-31`,
    );
    /*
     * Year pace, computed from the stays this route already read. It used to be hardcoded `'unknown'`, and
     * `promotionForNight` refuses to recommend a promotion on an unknown pace — so **every promotion was
     * suppressed on the authoritative plan**, while the board beside it still labelled 23 River and 19 Lindon
     * nights as `promote`. A host saw "promote" with no discount and a plan with no promotions, and neither
     * said why. The reservations are already in hand, so the pace is real rather than assumed.
     */
    const pace: YearPace = grossPace(house, stays, today).stillNeeded > 0 ? 'short' : 'met';
    const run = runShadow(board, taken, false, today, pace, closed);
    plans.push(pushPlanAll([run], gate, today)[0]!);
  }

  return corsJson(
    request,
    {
      plans: plans.map((plan) => ({
        ...plan,
        // A night-by-night list the desk can show, and the payload a future writer would use.
        lines: planLines(plan),
        // How much of that list is arithmetic on real asks. The panel says so next to the copy button.
        ...planProvenance(plan),
        // How far this plan still is from the market, so seven small raises do not read as a repricing.
        climb: planClimb(plan),
        payload: pushPayload(plan),
      })),
      summary: pushSummaryLine(plans),
      gate: { ...gate, send: pushSendState(gate) },
      shadowDays: { days: clock.days, required: clock.required, ready: clock.ready },
      storageReads: 'ok',
      /** True on every response: this route has no writer, so no price can leave from it. */
      sends: false,
    },
    200,
    { 'Cache-Control': 'no-store' },
  );
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
