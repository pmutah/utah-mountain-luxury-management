import { corsJson } from '../../_lib/data';
import { hostDenied, hostOnly } from '../../_lib/auth';
import { buildMarketBoard } from '../../../src/lib/market/board';
import { runShadow, portfolioDigest } from '../../../src/lib/market/shadow';
import { planClimb, planLines, planProvenance, pushPayload, pushPlanAll, pushSendState, pushSummaryLine, type PushGate } from '../../../src/lib/market/push';
import { shadowClockFromSaved, mergeSavedShadowDay, type SavedShadowDay } from '../../../src/lib/market/shadow-log';
import { getAllReservations } from '../../_lib/reservations-store';
import { loadCalendarBlocks } from '../../_lib/calendar-store';
import { loadLiveNights, loadApprovedRates } from '../../_lib/pricing-store';
import { kvGet, kvPut, storageReadPaused } from '../../_lib/kv-json';
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

  /*
   * One pass over the three houses, building everything the plan and the shadow digest need.
   *
   * The boards cost no extra reads here: this route has always loaded them, and the stays and blocks are already in
   * hand above. `runs` keeps them so the digest can be built from the **live** boards rather than the sample
   * fixtures — a day recorded from invented comps still counted toward the seven-day gate before, which was the
   * worst version of that bug.
   */
  const runs: Array<{
    house: HouseId;
    board: ReturnType<typeof buildMarketBoard>;
    run: ReturnType<typeof runShadow>;
    taken: string[];
    closed: string[];
    pace: YearPace;
  }> = [];

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
    runs.push({ house, board, run: runShadow(board, taken, false, today, pace, closed), taken, closed, pace });
  }

  /*
   * Record today's shadow day here, on the server, because this is the one place that holds everything the digest
   * needs: all three live boards, every stay, the blocks, and the pace.
   *
   * It used to be recorded only from `#/agents` and `#/market`, so a host who opened `#/overview` — the page the
   * dashboard lands on and the one anyone checks daily — advanced the seven-day gate by **nothing**. Verified on
   * production: a full overview visit left the clock at 1 of 7 and saved no day. The gate that decides whether
   * auto-pricing may ever act was waiting on a page nobody had been told to open.
   */
  let savedNow = saved;
  let shadowRecorded = false;
  if (!clock.dates.includes(today)) {
    const digest = portfolioDigest({
      asOf: today,
      taken: Object.fromEntries(runs.map((row) => [row.house, row.taken])) as Record<HouseId, string[]>,
      paused: { river: false, ranch: false, lindon: false },
      pace: Object.fromEntries(runs.map((row) => [row.house, row.pace])) as Record<HouseId, YearPace>,
      calendarLive: true,
      boards: Object.fromEntries(runs.map((row) => [row.house, row.board])),
      closed: Object.fromEntries(runs.map((row) => [row.house, row.closed])) as Record<HouseId, string[]>,
      stays,
    });
    /*
     * Only a day built from all three **live** boards may count. `portfolioDigest` names its own source, so the
     * two refusals are readable from the text: the unsent marker proves it is a shadow digest, and the absence of
     * "sample comps" proves no house fell back to the fixtures.
     */
    const usable =
      digest.includes('Nothing sent to Hospitable.') &&
      !digest.includes('sample comps') &&
      runs.every((row) => row.board.summary.liveComps > 0);
    if (usable) {
      const merged = mergeSavedShadowDay(saved, { date: today, digest, savedAt: new Date().toISOString() });
      try {
        await kvPut(env, 'shadowDays', merged);
        shadowRecorded = true;
        savedNow = merged;
      } catch {
        // A failed write leaves the clock as it was, and the response says so rather than implying a day landed.
      }
    }
  }
  // The gate reads the clock as it stands **after** today's write, so a day saved by this call is usable at once.
  const shownClock = shadowRecorded ? shadowClockFromSaved(savedNow, today) : clock;

  const gate: PushGate = {
    shadowReady: shownClock.ready,
    hasToken: Boolean(env.HOSPITABLE_WRITE_TOKEN),
    paused: false,
    calendarReady: true,
  };
  const plans = runs.map((row) => pushPlanAll([row.run], gate, today)[0]!);

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
      shadowDays: {
        days: shownClock.days,
        required: shownClock.required,
        ready: shownClock.ready,
        /** True when this call itself saved today, so the page can say the clock advanced. */
        recordedToday: shadowRecorded,
      },
      storageReads: 'ok',
      /** True on every response: this route has no writer, so no price can leave from it. */
      sends: false,
    },
    200,
    { 'Cache-Control': 'no-store' },
  );
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
