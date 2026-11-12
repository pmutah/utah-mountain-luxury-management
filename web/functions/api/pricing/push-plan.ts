import { corsJson } from '../../_lib/data';
import { hostDenied, hostOnly } from '../../_lib/auth';
import { unexpectedResponse } from '../../_lib/read-guard';
import { buildMarketBoard } from '../../../src/lib/market/board';
import { runShadow, portfolioDigest } from '../../../src/lib/market/shadow';
import { planClimb, planLines, planProvenance, pushPayload, pushPlanAll, pushSendState, pushSummaryLine, type PushGate } from '../../../src/lib/market/push';
import { daySawRealComps, shadowClockFromSaved, mergeSavedShadowDay, type SavedShadowDay } from '../../../src/lib/market/shadow-log';
import { getAllReservations } from '../../_lib/reservations-store';
import { loadCalendarBlocks } from '../../_lib/calendar-store';
import { loadLiveNights, loadApprovedRates } from '../../_lib/pricing-store';
import { kvGet, kvPut, storageReadPaused } from '../../_lib/kv-json';
import { denverToday, addDays, eachNight } from '../../../src/lib/market/dates';
import { grossPace } from '../../../src/lib/revenue-goals';
import type { YearPace } from '../../../src/lib/market/fill';
import { occupiedNights, type StaySpan } from '../../../src/lib/availability';
import type { HouseId } from '../../../src/lib/market/types';
import { readPause } from '../../_lib/platform/pause-store';
import { logChanges } from '../../_lib/platform/change-log';
import type { SettingsEnv } from '../../_lib/kv';

const HOUSES: HouseId[] = ['river', 'ranch', 'lindon'];

type Env = SettingsEnv & { DASHBOARD_PASSWORD?: string; HOSPITABLE_WRITE_TOKEN?: string; HOSPITABLE_PAT?: string };

/**
 * What a rate push would change, house by house. It reads the board, the calendar, and the saved
 * shadow days, then hands back a plan. It never sends: there is no writer here on purpose, so this
 * route cannot change a price even if every gate is open.
 */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  /*
   * Everything after the auth check runs inside one boundary.
   *
   * On production 2026-11-10 this route answered Cloudflare's `error code: 1102` page - a `text/plain` 503 that names
   * nothing - while the same code answered 200 on the preview alias and on every earlier production build. The stores read
   * fine (there is already a try around them, and a paused store has its own answer), so the throw is somewhere in the
   * body, and Cloudflare replaced it with a platform page. A host reading "1102" cannot tell whether their prices are
   * safe; a 500 that names the error at least says nothing was written.
   */
  try {
    return await buildPlanResponse(request, env);
  } catch (err) {
    return unexpectedResponse(request, err, 'The rate push plan');
  }
};

async function buildPlanResponse(request: Request, env: Env): Promise<Response> {
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
   * The per-house kill switch, read once.
   *
   * This used to be hard-coded `paused: false` for all three houses further down, so the Pause button on the Market board
   * changed a `useState` and the plan kept proposing raises. A switch the authoritative plan does not read is not a
   * switch. A switch that cannot be read is treated as paused: proposing a price for a house whose kill switch might be on
   * is the wrong way to be wrong.
   */
  const pause = await readPause(env);

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
    paused: boolean;
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
    /*
     * Through the end of the board's window, not the end of this calendar year.
     *
     * The range stopped at `${year}-12-31`, which is **exclusive**, so Dec 31 itself and every night of the next January
     * were treated as free. On production that made three sold nights read as open in the authoritative plan — the one that
     * proposes prices — on the busiest week of the year.
     */
    const windowEnd = addDays(eachNight(today, days)[days - 1] ?? today, 1);
    const taken = occupiedNights(spans, house, today, windowEnd);
    const closed = occupiedNights(
      blocks.map((block) => ({
        propertyId: block.propertyId,
        checkIn: block.start,
        checkOut: block.end,
      })),
      house,
      today,
      windowEnd,
    );
    /*
     * Year pace, computed from the stays this route already read. It used to be hardcoded `'unknown'`, and
     * `promotionForNight` refuses to recommend a promotion on an unknown pace — so **every promotion was
     * suppressed on the authoritative plan**, while the board beside it still labelled 23 River and 19 Lindon
     * nights as `promote`. A host saw "promote" with no discount and a plan with no promotions, and neither
     * said why. The reservations are already in hand, so the pace is real rather than assumed.
     */
    const pace: YearPace = grossPace(house, stays, today).stillNeeded > 0 ? 'short' : 'met';
    runs.push({
      house,
      board,
      run: runShadow(board, taken, pause.paused[house], today, pace, closed),
      taken,
      closed,
      pace,
      paused: pause.paused[house],
    });
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
      paused: Object.fromEntries(runs.map((row) => [row.house, row.paused])) as Record<HouseId, boolean>,
      pace: Object.fromEntries(runs.map((row) => [row.house, row.pace])) as Record<HouseId, YearPace>,
      calendarLive: true,
      boards: Object.fromEntries(runs.map((row) => [row.house, row.board])),
      closed: Object.fromEntries(runs.map((row) => [row.house, row.closed])) as Record<HouseId, string[]>,
      stays,
    });
    /*
     * Only a day built from all three **live** boards may count. `portfolioDigest` names its own source.
     * `daySawRealComps` requires the digest to say "saved comps" and refuses one that says "sample comps"
     * or that never mentions comps. The inline sample check stays beside it so this call site still shows
     * the refusal in the route itself.
     */
    const usable =
      digest.includes('Nothing sent to Hospitable.') &&
      !digest.includes('sample comps') &&
      daySawRealComps(digest) &&
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
    /*
     * Either name counts.
     *
     * The gate checked `HOSPITABLE_WRITE_TOKEN` while the sender I built requires `HOSPITABLE_PAT` — and the PAT is what the
     * owner actually stored. So the plan would have said "There is no Hospitable write token, so a rate stays closed" while a
     * token sat in the project, pointing a host at a secret that already existed.
     *
     * The PAT is the real credential: it is what `/api/pricing/publish-rates` sends. The older name is kept because other routes
     * and the docs still use it, and a deployment with only that set should not read as "no token".
     */
    hasToken: Boolean(env.HOSPITABLE_PAT?.trim() || env.HOSPITABLE_WRITE_TOKEN?.trim()),
    /*
     * Paused if **any** house is paused. `pushPlanAll` is called per house below and each run already carries its own
     * paused flag from `runShadow`, so this is the overall gate: a host who paused one house should not read a plan whose
     * summary claims all three are live.
     */
    paused: runs.some((row) => row.paused),
    calendarReady: true,
  };
  const plans = runs.map((row) => pushPlanAll([row.run], {
    ...gate,
    // Per house, so a paused house's own plan says why rather than inheriting another house's state.
    paused: row.paused,
  }, today)[0]!);

  /*
   * The change log: one row per night that actually moved.
   *
   * The plan requires it, the table has existed since `0001_market.sql`, and nothing had ever written to it. This records the
   * shadow plan's own moves — a night whose proposed ask differs from the published one — with the reason it moved. It runs
   * after the plans are built and before the gate is judged in the response, because a change is a fact about the plan rather
   * than about permission: a blocked plan still describes what it would do, and logging it under `mode: 'shadow'` says so.
   *
   * A failed write is reported in the response. A change log that silently drops rows is worse than none, because the next
   * reader believes it is complete.
   */
  const moved = plans.flatMap((plan) =>
    plan.nights.map((night) => ({
      house: plan.house,
      date: night.date,
      beforeRate: night.from,
      afterRate: night.to,
      /*
       * `PushNight` carries the kind and the band, not a written reason, so the reason is composed from what the plan already
       * knows: what it is doing, and how far the night still sits from its comps. A log row that says only "$179 to $193" is a
       * true statement that explains nothing.
       */
      reason:
        night.kind === 'promote'
          ? 'A 20% fill promotion on a night the fill rules call short.'
          : night.kind === 'restore'
            ? 'Back to the published base after the promotion ended.'
            : `A raise toward p85 of the comp band${typeof night.percentileAfter === 'number' ? `, now at p${night.percentileAfter}` : ''}${night.bandP75 ? `, band top $${night.bandP75}` : ''}.`,
      mode: 'shadow' as const,
    })),
  );
  const logged = await logChanges(env, moved);
  // The count the desk can check: how many nights this plan logged, and whether the log took them.
  const changeLog = logged.ok
    ? { written: logged.written, skipped: logged.skipped, stored: true }
    : { written: logged.written, skipped: 0, stored: false, reason: logged.reason };

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
      /**
       * The kill switch as the plan read it. A host looking at "nothing to push" needs to know whether that is because every
       * night is already priced or because the house is paused — and `readable: false` means every house is treated as
       * paused, so a plan that looks quiet is not mistaken for a plan that is live.
       */
      pause: {
        paused: pause.paused,
        readable: pause.ok,
        why: pause.ok ? undefined : pause.why,
        reasons: pause.ok ? pause.reasons : {},
      },
      /** True on every response: this route has no writer, so no price can leave from it. */
      sends: false,
      /**
       * What the change log took. A plan that moved nights and could not log them says so here rather than reading as though
       * every change were recorded.
       */
      changeLog,
    },
    200,
    { 'Cache-Control': 'no-store' },
  );
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
