import { addDays, isWeekendNight, weekdayIndex } from './market/dates';
import { RIVER_UNITS, type RiverUnitId } from './river-units';

/**
 * Whether to sell the Riverhouse whole or split, per date range.
 *
 * The host's preference is explicit: **hold the house whole whenever it can plausibly sell whole**, and split only
 * to capture income that would otherwise be lost. So this is not "which earns more per night" — a whole-house booking
 * is worth more than the units combined, and splitting can also block a likely whole stay. It compares expected value,
 * including the extra turnover cost of split stays, and it says why in one sentence.
 *
 * Every input has a **visible default** rather than a hidden constant, and the reason line names the numbers. The
 * spec asks for decisions the host can see and adjust; a score with no explanation is the thing this app has spent
 * its life removing.
 */

export type SplitMode = 'auto' | 'suggest-only' | 'off';

export type SplitDefaults = {
  /** Probability a whole-house stay books, by lead time and day kind. */
  wholeLikelihood: { peak: number; weekend: number; weekday: number; offPeakWeekday: number };
  /** Probability each unit books when offered, by season. Smaller units book more often than the house. */
  unitLikelihood: { peak: number; offPeak: number };
  /** Extra cleaning and laundry a split stay adds over one whole-house turn. */
  splitTurnoverCost: number;
  /** Months treated as off-peak (1-12). */
  offPeakMonths: readonly number[];
  /** Whole-house cleaning, and each unit's own. */
  wholeCleaning: number;
  unitCleaning: Record<RiverUnitId, number>;
};

/**
 * Transparent defaults, deliberately round.
 *
 * These are stated as numbers the host can disagree with, not tuned constants. The history this project has is thin
 * and unrepresentative, so a confident model would be a fiction; a simple one the host can see and correct is honest.
 */
export const DEFAULT_SPLIT: SplitDefaults = {
  wholeLikelihood: { peak: 0.62, weekend: 0.45, weekday: 0.12, offPeakWeekday: 0.05 },
  unitLikelihood: { peak: 0.3, offPeak: 0.42 },
  splitTurnoverCost: 120,
  offPeakMonths: [1, 2, 3, 11, 12],
  wholeCleaning: 350,
  unitCleaning: { 'garage-suite': 90, 'recreation-wing': 150, 'main-lodge': 200 },
};

export type SplitPrices = {
  wholeNightly: number;
  unitNightly: Record<RiverUnitId, number>;
};

export type SplitDecision = {
  /** What the system chose for this range. */
  choice: 'whole' | 'split' | 'both';
  /** One line the host can read, naming the numbers behind the choice. */
  reason: string;
  /** Expected value of holding the whole house. */
  wholeExpected: number;
  /** Expected value of offering the free units. */
  splitExpected: number;
  /** Units that would be offered. */
  units: RiverUnitId[];
  /** True when this is a peak stretch held whole on purpose. */
  heldWholeForPeak: boolean;
};

/** A night in a month treated as off-peak. */
function offPeak(iso: string, defaults: SplitDefaults): boolean {
  return defaults.offPeakMonths.includes(Number(iso.slice(5, 7)));
}

/**
 * How likely a whole-house booking is for one night.
 *
 * Holidays count as peak. Otherwise a weekend night is likelier than a weekday, and an off-peak weekday is the least
 * likely of all — which is exactly the night splitting exists to fill.
 */
export function wholeLikelihoodFor(
  iso: string,
  defaults: SplitDefaults = DEFAULT_SPLIT,
  holiday = false,
): number {
  if (holiday) return defaults.wholeLikelihood.peak;
  if (isWeekendNight(iso)) return defaults.wholeLikelihood.weekend;
  if (offPeak(iso, defaults)) return defaults.wholeLikelihood.offPeakWeekday;
  return defaults.wholeLikelihood.weekday;
}

/**
 * The units worth offering for a range: the ones free on **every** night in it, and that carry a real price.
 *
 * A unit free on only part of a range cannot be sold for that range, and offering it would promise nights it does not
 * have. This is why the caller passes availability rather than a single flag.
 *
 * A unit with no price is not offerable either. It was possible to pass `0` for an unpriced unit, and the engine would
 * then sum it as a free night — a split that "earns" nothing while costing a turnover. So the price is checked here,
 * where the decision is made, not trusted from the caller.
 */
export function offerableUnits(
  freeUnitsByNight: Readonly<Record<string, number>>,
  unitFreeNightly: Readonly<Record<string, ReadonlySet<string>>>,
  from: string,
  until: string,
  unitNightly?: Readonly<Record<string, number>>,
): RiverUnitId[] {
  const nights = nightsBetween(from, until);
  if (nights.length === 0) return [];
  return RIVER_UNITS.filter((unit) => {
    // A unit with no price is not sellable, so it cannot be part of a split.
    if (unitNightly && !((unitNightly[unit] ?? 0) > 0)) return false;
    return nights.every((night) => (freeUnitsByNight[night] ?? 0) > 0 && unitFreeNightly[unit]?.has(night));
  });
}

/**
 * Decide whole versus split for one range.
 *
 * Whole is preferred whenever it is plausible. Splitting is chosen when the house is unlikely to sell *and* the units
 * clear the extra turnover — the "fill the gap" case, and off-peak weekdays.
 */
export function decideSplit(input: {
  from: string;
  until: string;
  prices: SplitPrices;
  freeUnitsByNight: Readonly<Record<string, number>>;
  unitFreeNightly: Readonly<Record<string, ReadonlySet<string>>>;
  /** Nights already sold whole inside the range, which cannot be split. */
  wholeBlocked?: ReadonlySet<string>;
  defaults?: SplitDefaults;
  /** Off-peak month override from the host, when set. */
  season?: 'peak' | 'off-peak';
  holidays?: ReadonlySet<string>;
}): SplitDecision {
  const defaults = input.defaults ?? DEFAULT_SPLIT;
  const nights = nightsBetween(input.from, input.until);
  const peak = input.season === 'peak';
  const isOffPeak = input.season === 'off-peak';

  // Expected whole revenue: the house only sells a night it is actually free for.
  let wholeExpected = 0;
  for (const night of nights) {
    if (input.wholeBlocked?.has(night)) continue;
    wholeExpected += input.prices.wholeNightly * wholeLikelihoodFor(night, defaults, input.holidays?.has(night) ?? false);
  }
  // One whole-house clean, once, if anything sells.
  const wholeNet = wholeExpected - (wholeExpected > 0 ? defaults.wholeCleaning : 0);

  const units = offerableUnits(input.freeUnitsByNight, input.unitFreeNightly, input.from, input.until, input.prices.unitNightly);
  const unitProbability = isOffPeak || (!peak && nights.some((n) => offPeak(n, defaults)))
    ? defaults.unitLikelihood.offPeak
    : defaults.unitLikelihood.peak;
  let splitExpected = 0;
  if (units.length > 0) {
    /*
     * Each offered unit contributes its nightly rate on every night of the range, times the chance it books. Written
     * as a single product rather than a nested loop: the inner value did not depend on the night, so the loop only
     * looked like it was doing per-night work.
     */
    const perNight = units.reduce((sum, unit) => sum + input.prices.unitNightly[unit], 0);
    splitExpected = perNight * unitProbability * nights.length;
    splitExpected -= units.reduce((sum, unit) => sum + defaults.unitCleaning[unit], 0) + defaults.splitTurnoverCost;
  }

  /*
   * A peak stretch is held whole **even when the units would pay more today**, because a whole-house booking is worth
   * more and splitting can take the nights a whole group would have bought. That is the host's stated preference and
   * the spec's rule, so it is checked before the arithmetic rather than after it.
   */
  const weekendNights = nights.filter((night) => isWeekendNight(night)).length;
  const heldWholeForPeak = peak && weekendNights > 0;
  if (heldWholeForPeak) {
    return {
      choice: 'whole',
      units: [],
      wholeExpected: round(wholeNet),
      splitExpected: round(splitExpected),
      heldWholeForPeak: true,
      /*
       * Both figures here are expected value for the range, after cleaning and turnover. The first version compared
       * the whole-house **nightly rate** against the split **net**, which reads as a comparison and is not one —
       * "$2,400 beats splitting at $790" invites the host to conclude the units were only worth $790 when the real
       * point is that a whole stay is worth more than the units combined.
       */
      reason:
        `Peak weekend held whole: ${weekendNights === 1 ? '1 weekend night' : `${weekendNights} weekend nights`} at ` +
        `${money(input.prices.wholeNightly)} a night, about ${money(wholeNet)} expected, against ${money(splitExpected)} ` +
        'from splitting once the extra turns are counted. Units are not offered.',
    };
  }

  if (units.length === 0) {
    return {
      choice: 'whole',
      units: [],
      wholeExpected: round(wholeNet),
      splitExpected: 0,
      heldWholeForPeak: false,
      reason: 'No unit is free for every night of this range, so only the whole house can be offered.',
    };
  }
  if (wholeNet <= 0 && splitExpected <= 0) {
    return {
      choice: 'whole',
      units,
      wholeExpected: 0,
      splitExpected: round(splitExpected),
      heldWholeForPeak: false,
      reason: 'Neither the house nor the units clear their own turnover cost, so this range is held whole and unpromoted.',
    };
  }
  if (splitExpected > wholeNet) {
    return {
      choice: 'both',
      units,
      wholeExpected: round(wholeNet),
      splitExpected: round(splitExpected),
      heldWholeForPeak: false,
      /*
       * The whole-house figure is small on an off-peak weekday because the likelihood is low, not because the rate is.
       * Said plainly, or "$10 from holding whole" reads as a broken calculator to the one person who knows what a
       * night there costs.
       */
      reason:
        `Units offered alongside the house: expected ${money(splitExpected)} from ${units.length} ` +
        `${units.length === 1 ? 'unit' : 'units'}, against ${money(wholeNet)} from holding whole — ` +
        `a whole group rarely takes ${weekdayCount(nights) === nights.length ? 'weekdays' : 'these nights'}, so the house` +
        ' stays open and the units fill what it does not.',
    };
  }
  return {
    choice: 'whole',
    units: [],
    wholeExpected: round(wholeNet),
    splitExpected: round(splitExpected),
    heldWholeForPeak: false,
    reason:
      `Held whole: expected ${money(wholeNet)} against ${money(splitExpected)} for splitting, and a whole-house stay ` +
      'does not block a later one.',
  };
}

/**
 * Whether the units should be shown at all.
 *
 * `off` hides them entirely; `suggest-only` and `auto` both show them when the decision offers them, differing only in
 * whether the host has to accept the choice first. Nothing is hidden in advance of a booking — the spec is explicit
 * that all four listings are sellable at once and blocking happens *when* a booking lands.
 */
export function unitsVisible(mode: SplitMode): boolean {
  return mode !== 'off';
}

function money(value: number): string {
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Every night from `from` up to but not including `until`. */
export function nightsBetween(from: string, until: string): string[] {
  const out: string[] = [];
  let cursor = from;
  while (cursor < until) {
    out.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return out;
}

/** How many of these nights are weekdays, so a reason can say "weekdays" only when it is true. */
function weekdayCount(nights: readonly string[]): number {
  return nights.filter((night) => !isWeekendNight(night)).length;
}

export { weekdayIndex };
