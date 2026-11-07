import { pushPlanFor, pushSummaryLine, planLines, type PushGate } from '../src/lib/market/push';
import type { ShadowNight, ShadowRun } from '../src/lib/market/shadow';
import type { HouseId } from '../src/lib/market/types';
import { denverToday } from '../src/lib/market/dates';
import { nightAsk } from '../src/lib/market/rates';

/**
 * Local preview only. The deployed route builds the plan from the board and the saved shadow days.
 * The gates are open here so the plan can be seen carrying nights, because the deployed gate is
 * closed until seven Denver days are saved. `?open=0` shows the closed state instead.
 */
function night(date: string, over: Partial<ShadowNight> = {}): ShadowNight {
  return {
    date,
    season: 'winter',
    ourGuest: 1200,
    floorGuest: 900,
    compRates: [1400],
    p25: 1300,
    median: 1400,
    p75: 1500,
    openComps: 5,
    percentile: 60,
    proposedGuest: 1296,
    promotionPercent: 0,
    offerGuest: 1296,
    minNights: 2,
    action: 'raise',
    reason: 'Preview.',
    compBookedShare: 40,
    source: 'sample',
    ...over,
  };
}

function run(house: HouseId, nights: ShadowNight[]): ShadowRun {
  return {
    house,
    paused: false,
    nights,
    counts: { hold: 0, raise: 0, promote: 0, locked: 0, booked: 0, closed: 0, paused: 0 },
    digest: 'Nothing sent to Hospitable.',
  };
}

export function devPushPlan(open: boolean) {
  const today = denverToday();
  const day = (n: number) => {
    const at = new Date(`${today}T00:00:00Z`);
    at.setUTCDate(at.getUTCDate() + n);
    return at.toISOString().slice(0, 10);
  };
  /**
   * A night priced off the real card, so the approve control in this preview passes the same guard
   * the deployed route runs. A made-up number would be refused, which reads as a broken control.
   */
  const priced = (house: HouseId, iso: string, over: Partial<ShadowNight> = {}): ShadowNight => {
    const ask = nightAsk(house, iso);
    const raise = Math.max(1, Math.round(ask.guest * 0.08));
    const base = night(iso, {
      ourGuest: ask.guest,
      floorGuest: ask.floorGuest,
      proposedGuest: ask.guest + raise,
      offerGuest: ask.guest + raise,
      compRates: [ask.guest + raise],
      p25: ask.guest,
      median: ask.guest + raise,
      p75: ask.guest + raise * 2,
    });
    if (over.action !== 'promote') return { ...base, ...over };
    // A promotion is 20% off the card, never under the floor.
    const promo = Math.max(Math.round(ask.floorGuest), Math.round(ask.guest * 0.8));
    return { ...base, ...over, proposedGuest: promo, offerGuest: promo, compRates: [promo], median: promo };
  };
  const nights = (house: HouseId) =>
    house === 'river'
      ? [
          priced(house, day(3)),
          priced(house, day(4), { action: 'booked' }),
          priced(house, day(5), { action: 'promote', promotionPercent: 20 }),
          priced(house, day(6), { action: 'hold' }),
          priced(house, day(7)),
        ]
      : house === 'ranch'
        ? [priced(house, day(2)), priced(house, day(3), { action: 'closed' })]
        : [priced(house, day(5), { action: 'locked' })];

  const gate: PushGate = {
    shadowReady: open,
    hasToken: open,
    paused: false,
    calendarReady: true,
  };
  const runs = (['river', 'ranch', 'lindon'] as HouseId[]).map((house) => run(house, nights(house)));
  const plans = runs.map((row) => pushPlanFor(row.house, row, gate));

  return {
    plans: plans.map((plan) => ({ ...plan, lines: planLines(plan) })),
    summary: pushSummaryLine(plans),
    gate,
    shadowDays: { days: open ? 7 : 2, required: 7, ready: open },
    storageReads: 'ok' as const,
    sends: false as const,
    source: 'dev-preview' as const,
  };
}
