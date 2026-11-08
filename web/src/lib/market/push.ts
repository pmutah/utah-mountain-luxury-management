import type { HouseId } from './types';
import type { ShadowNight, ShadowRun } from './shadow';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** One night the engine would change. The rate is the guest price for that night. */
export type PushNight = {
  house: HouseId;
  date: string;
  from: number;
  to: number;
  /** `raise`, `promote`, or a restore after a promotion ends. */
  kind: 'raise' | 'promote' | 'restore';
};

export type PushPlan = {
  house: HouseId;
  /** True when the plan is allowed to run at all. */
  allowed: boolean;
  /** Why it is not allowed, when it is not. */
  hold: string | null;
  nights: PushNight[];
  /** What the plan would do, in one sentence. No price is quoted here. */
  line: string;
};

export type PushGate = {
  /** The shadow clock has seen enough days. */
  shadowReady: boolean;
  /** A write token exists on this deployment. */
  hasToken: boolean;
  /** The house is paused for the season. */
  paused: boolean;
  /** The booking calendar was actually read. */
  calendarReady: boolean;
};

/**
 * Night states a push must never touch. `hold` belongs here: it means the engine deliberately left
 * the rate alone, so pushing it would change a price the engine decided not to change.
 */
const BLOCKED = new Set(['booked', 'closed', 'paused', 'locked', 'hold']);

/**
 * The nights a push would change, taken from a shadow run.
 *
 * Every guard the shadow run already applied is respected: a booked, closed, paused, or holiday-
 * locked night is never in the plan, and neither is a night the engine left on `hold`. A night
 * whose price would not actually move is dropped, so the plan is the real difference and not a
 * restatement of the board.
 */
export function pushNights(house: HouseId, nights: readonly ShadowNight[]): PushNight[] {
  const out: PushNight[] = [];
  for (const night of nights) {
    if (!DATE.test(night.date)) continue;
    if (BLOCKED.has(night.action)) continue;
    const from = Math.round(night.ourGuest);
    const to = Math.round(night.offerGuest);
    if (!Number.isFinite(from) || !Number.isFinite(to)) continue;
    if (to <= 0) continue;
    // A raise never drops below the floor, and the engine already holds the base. Belt and braces.
    if (to < Math.round(night.floorGuest)) continue;
    if (from === to) continue;
    out.push({
      house,
      date: night.date,
      from,
      to,
      kind: night.action === 'promote' ? 'promote' : to > from ? 'raise' : 'restore',
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Why a push cannot run. Null means the plan is clear to show as sendable. */
export function pushHold(gate: PushGate): string | null {
  if (!gate.calendarReady) {
    return 'The booking calendar was not read, so no rate is sent. A stand-in calendar is not a reason to change a price.';
  }
  if (gate.paused) return 'This house is paused for the season. The published rate stays.';
  if (!gate.shadowReady) return 'The shadow week is not finished. A rate stays closed until seven Denver days are saved.';
  if (!gate.hasToken) return 'There is no Hospitable write token, so a rate stays closed.';
  return null;
}

/**
 * Whether a rate could actually leave this app, and **where it would have to go**.
 *
 * Two separate facts, and the second one changes the first:
 *
 * 1. No writer exists. `HOSPITABLE_WRITE_TOKEN` is only read to compute the gate; a repo-wide scan found no
 *    Hospitable host and no outbound price call. A fully open gate builds a payload and stops.
 *
 * 2. **Hospitable is the wrong destination anyway.** The owner's own vault note says "Hospitable is the
 *    calendar and inbox. Do not change nightly rates or create promotions here. Promotions go on Airbnb and
 *    VRBO directly", and `pricing-doctrine.ts` says the same in its own words: "Do not change the rate and
 *    do not create the promotion in Hospitable." So a sender aimed at Hospitable's calendar API would do the
 *    one thing the doctrine forbids, and would not produce the Airbnb/VRBO promotion badges that make a
 *    discount worth running in the first place.
 *
 * This function therefore never says "set the token and it will send", because that is not true.
 */
export function pushSendState(gate: PushGate): { sends: boolean; line: string } {
  if (!gate.hasToken) {
    return {
      sends: false,
      line: 'A rate would not leave this app: there is no write token, no sender, and Hospitable is not the destination for a rate anyway.',
    };
  }
  return {
    sends: false,
    line: 'A rate still would not leave this app: no sender is built, and the doctrine keeps rates out of Hospitable. A rate and a promotion are typed on Airbnb and VRBO directly.',
  };
}

/** A plan for one house. It never sends anything; it only says what would change. */
export function pushPlanFor(house: HouseId, run: ShadowRun, gate: PushGate): PushPlan {
  const hold = pushHold({ ...gate, paused: gate.paused || run.paused });
  const nights = hold ? [] : pushNights(house, run.nights);
  if (hold) return { house, allowed: false, hold, nights: [], line: hold };
  if (nights.length === 0) {
    return {
      house,
      allowed: true,
      hold: null,
      nights: [],
      line: 'No night would change. Every night is booked, closed, locked, paused, or already at the ask.',
    };
  }
  const raises = nights.filter((night) => night.kind === 'raise').length;
  const promos = nights.filter((night) => night.kind === 'promote').length;
  const restores = nights.filter((night) => night.kind === 'restore').length;
  const parts = [
    raises === 0 ? '' : raises === 1 ? '1 night up' : `${raises} nights up`,
    promos === 0 ? '' : promos === 1 ? '1 night on a 20% promotion' : `${promos} nights on a 20% promotion`,
    restores === 0 ? '' : restores === 1 ? '1 night back to the base' : `${restores} nights back to the base`,
  ].filter(Boolean);
  const line = `${nights.length === 1 ? '1 night' : `${nights.length} nights`} would change: ${parts.join(', ')}. Nothing is sent from this page.`;
  return { house, allowed: true, hold: null, nights, line: line.includes('$') ? 'The plan is ready. Nothing is sent from this page.' : line };
}

/** The plan across all three houses, for a gate that applies to the whole board. */
export function pushPlanAll(runs: readonly ShadowRun[], gate: PushGate): PushPlan[] {
  return runs.map((run) => pushPlanFor(run.house, run, gate));
}

/** One line for the desk. It does not quote a rate. */
export function pushSummaryLine(plans: readonly PushPlan[]): string {
  if (plans.length === 0) return 'No house to plan for. Nothing is sent.';
  const blocked = plans.filter((plan) => !plan.allowed);
  if (blocked.length === plans.length) return `No rate is sent. ${blocked[0]!.hold ?? ''}`.trim();
  const changing = plans.filter((plan) => plan.allowed && plan.nights.length > 0);
  if (changing.length === 0) return 'No night would change. Nothing is sent.';
  const total = changing.reduce((sum, plan) => sum + plan.nights.length, 0);
  const houses = changing.length === 1 ? '1 house' : `${changing.length} houses`;
  return `${total === 1 ? '1 night' : `${total} nights`} across ${houses} would change. Nothing is sent from this page.`;
}

/**
 * A payload shaped for a Hospitable write. It is only built when the plan is allowed, so a caller
 * cannot accidentally hand a blocked plan to a sender and have it go out.
 */
export type PushPayload = {
  house: HouseId;
  nights: Array<{ date: string; rate: number }>;
};

export function pushPayload(plan: PushPlan): PushPayload | null {
  if (!plan.allowed || plan.nights.length === 0) return null;
  return {
    house: plan.house,
    nights: plan.nights.map((night) => ({ date: night.date, rate: night.to })),
  };
}

/** The plan as a night-by-night list for the desk. No price is quoted. */
export function planLines(plan: PushPlan): string[] {
  return plan.nights.slice(0, 14).map((night) => {
    const when = new Date(`${night.date}T12:00:00Z`).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      weekday: 'short',
      timeZone: 'UTC',
    });
    const label = night.kind === 'promote' ? '20% promotion' : night.kind === 'raise' ? 'raise' : 'back to base';
    return `${when}: ${label}.`;
  });
}
