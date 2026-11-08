import type { BoardSource, HouseId } from './types';
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
  /**
   * Where the band behind this price came from. Carried because a plan line is an **instruction**: the panel
   * tells the host to type `to` into Airbnb. A price derived from `fixtures.ts` is derived from numbers this
   * repo invented ("Sample · Canyon lodge", $2,100 a night), so printing it as a rate to type asks the host to
   * copy a fabrication into a live listing. The board already knows this per night; it was discarded on the
   * way into the plan, which is how 50 of 60 live plan lines came to be priced off sample comps.
   */
  source: BoardSource;
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
 * The shortest lead time at which changing a rate is worth doing. A night that is already here, or
 * arriving tomorrow, is not repriced: the guests who would book it have already decided, and a rate typed
 * in on the day is work that cannot pay for itself. The shadow preview was proposing to raise **tonight's**
 * Ranch rate from $640 to $662 — a real, if small, waste of a step.
 */
export const MIN_LEAD_DAYS = 2;

/** Whole nights between two YYYY-MM-DD dates. Null when either is not a date. */
export function leadDays(asOf: string, iso: string): number | null {
  if (!DATE.test(asOf) || !DATE.test(iso)) return null;
  const from = Date.UTC(Number(asOf.slice(0, 4)), Number(asOf.slice(5, 7)) - 1, Number(asOf.slice(8, 10)));
  const to = Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  return Math.round((to - from) / 86_400_000);
}

/**
 * The nights a push would change, taken from a shadow run.
 *
 * Every guard the shadow run already applied is respected: a booked, closed, paused, or holiday-
 * locked night is never in the plan, and neither is a night the engine left on `hold`. A night
 * whose price would not actually move is dropped, so the plan is the real difference and not a
 * restatement of the board.
 *
 * A night inside `MIN_LEAD_DAYS` is also dropped: repricing tonight changes nothing a guest can act on.
 */
export function pushNights(house: HouseId, nights: readonly ShadowNight[], asOf?: string): PushNight[] {
  const out: PushNight[] = [];
  for (const night of nights) {
    if (!DATE.test(night.date)) continue;
    if (BLOCKED.has(night.action)) continue;
    if (asOf) {
      const lead = leadDays(asOf, night.date);
      if (lead !== null && lead < MIN_LEAD_DAYS) continue;
    }
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
      source: night.source,
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

/**
 * A plan for one house. It never sends anything; it only says what would change.
 *
 * **A waiting gate is not a reason to hide the preview.** The shadow week blocks *sending*, but its whole
 * purpose is to let the desk watch what auto-pricing would do for seven days before it is trusted. Every
 * hold used to drop the nights, so during that week the plan reported "the shadow week is not finished"
 * and showed nothing — the preview was blank exactly when it mattered. Now the shadow-week hold keeps its
 * nights and reads as a preview; a hold that means the data is unusable (an unread calendar, a paused
 * house) still drops them, because those nights would be invented rather than previewed.
 */
export function pushPlanFor(house: HouseId, run: ShadowRun, gate: PushGate, asOf?: string): PushPlan {
  const hold = pushHold({ ...gate, paused: gate.paused || run.paused });

  /*
   * Which holds mean "the data is unusable" and which mean "waiting, but the data is fine".
   *
   * - Unread calendar, or a paused house: the nights themselves cannot be trusted, so they are dropped.
   * - Shadow week unfinished, or no write token: both are states of the *permission* to send. The nights
   *   are still real and worth watching, which is the entire reason a shadow week exists.
   */
  const dataUnusable = !gate.calendarReady || gate.paused || run.paused;
  const nights = dataUnusable ? [] : pushNights(house, run.nights, asOf);

  if (hold && dataUnusable) return { house, allowed: false, hold, nights: [], line: hold };
  if (hold) {
    const preview =
      nights.length === 0
        ? 'Preview: no night would change once this is open.'
        : `Preview only: ${nights.length === 1 ? '1 night' : `${nights.length} nights`} would change. ${hold}`;
    return { house, allowed: false, hold, nights, line: preview };
  }
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
export function pushPlanAll(runs: readonly ShadowRun[], gate: PushGate, asOf?: string): PushPlan[] {
  return runs.map((run) => pushPlanFor(run.house, run, gate, asOf));
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

/**
 * The plan as a night-by-night list for the desk, **with the price to type** — but only where the price
 * rests on a real observation.
 *
 * This used to omit the price deliberately — a plan must never read as a published rate. But a list saying
 * "Dec 6: raise" with no number is not actionable: the host has to hunt the figure elsewhere to do the one
 * thing the plan exists to prompt. The panel is host-only, behind the dashboard gate, and says plainly that
 * nothing is sent, so the number belongs here. The night's `from` is also shown so the change is visible
 * rather than implied.
 *
 * **Except on the sample set.** A line whose band came from `fixtures.ts` is arithmetic on numbers this repo
 * invented — there is no Canyon lodge asking $2,100. Printing it in the same shape as a measured line, under a
 * "Copy these prices" button, invites the host to paste a fabrication into a live listing. On this board that
 * was 50 of 60 lines. Those lines name the change and the source instead of a figure to type, because a price
 * with nothing behind it is exactly the defect this whole surface exists to avoid.
 */
export function planLines(plan: PushPlan): string[] {
  return plan.nights.slice(0, 14).map((night) => {
    const when = new Date(`${night.date}T12:00:00Z`).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      weekday: 'short',
      timeZone: 'UTC',
    });
    const label = night.kind === 'promote' ? '20% promotion' : night.kind === 'raise' ? 'raise' : 'back to base';
    if (night.source === 'sample') {
      return `${when}: ${label} suggested, no price to type — the only comps for this night are the invented sample set.`;
    }
    return `${when}: ${label}, $${night.from} to $${night.to}.`;
  });
}

/**
 * How many of a plan's lines carry a price built on a measured ask, and how many rest on the sample set.
 *
 * The host needs this beside the copy button: a plan of thirty lines where twenty-seven are sample arithmetic
 * looks identical to a plan of thirty measured ones, and only one of those is safe to act on.
 *
 * The keys are named to match what the panel reads. An earlier version returned `{ live, sample, note }` while
 * `PushPlanPanel` rendered `plan.sampleNote`, so the warning was computed, sent, and then silently dropped on
 * the floor — the same "label with nothing behind it" shape this whole change exists to remove.
 */
export function planProvenance(plan: PushPlan): { liveLines: number; sampleLines: number; sampleNote: string | null } {
  const shown = plan.nights.slice(0, 14);
  const sampleLines = shown.filter((night) => night.source === 'sample').length;
  const liveLines = shown.length - sampleLines;
  const sampleNote =
    sampleLines === 0
      ? null
      : `${
          sampleLines === shown.length
            ? 'None of these prices is measured'
            : `${sampleLines} of ${shown.length === 1 ? 'this line is' : `these ${shown.length} lines are`} not measured`
        }: the only comps for ${sampleLines === 1 ? 'that night are' : 'those nights are'} the invented sample set, so no price is shown to type. Add a real comp for those dates before acting.`;
  return { liveLines, sampleLines, sampleNote };
}
