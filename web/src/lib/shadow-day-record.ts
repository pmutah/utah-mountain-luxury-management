/**
 * Recording a shadow day, from whichever surface the host actually opened.
 *
 * The seven-day shadow clock gates the whole rate push: `pushHold` refuses with "the shadow week is
 * not finished" until seven Denver days are saved, and a write token cannot unlock it. But a day was
 * only ever saved by `MarketBoard`, so the clock advanced only if the host opened `#/market`. The
 * nightly brief â€” the thing a host actually reads every day â€” displayed "Shadow day 1 of 7" and never
 * said how to move it, and reading the brief did not count. A host following the brief daily would
 * sit at day one forever and never learn why the push stayed closed.
 *
 * This module is the one place that decides whether a day may be recorded and what it says, so the
 * market page and the brief cannot drift into recording different digests for the same day.
 */
import { loadQuoteCalendar } from './booked-nights';
import { usePreferenceTimes } from '../hooks/useArrivalWindows';
import { chooseComps, loadCompChoices } from './market/comps';
import { compsFor } from './market/fixtures';
import { denverToday } from './market/dates';
import type { YearPace } from './market/fill';
import { portfolioDigest } from './market/shadow';
import { grossPace } from './revenue-goals';
import { SHADOW_UNREAD, recordShadowDay, type ShadowDay } from './market/shadow-log';
import type { HouseId } from './market/types';

const HOUSES: HouseId[] = ['river', 'ranch', 'lindon'];

export type ShadowSaveState =
  /** Still reading the calendar and the stays, so a day cannot be judged yet. */
  | 'loading'
  /** A day can be saved. */
  | 'ready'
  /** The calendar could not be read, so this day would not count. */
  | 'unread';

export type ShadowDayRecord = {
  state: ShadowSaveState;
  /** The digest for today. Empty until the state is `ready`. */
  digest: string;
};

/**
 * The digest for today, from what this surface has actually read.
 *
 * A digest is only a shadow day when it does not carry `SHADOW_UNREAD`. Building one off an unread
 * calendar would save a day that `shadowClockFromSaved` then discards, which looks like progress and
 * is not, so this returns `unread` instead and the caller says so.
 */
export function shadowDayDigest(input: {
  asOf: string;
  calendarLive: boolean;
  taken: Record<HouseId, string[]>;
  closed: Record<HouseId, string[]>;
  paused: Record<HouseId, boolean>;
  /**
   * The stays the digest reads. Deliberately the narrow shape `portfolioDigest` needs rather than
   * `Reservation`: the pace loader returns `PaceStay`, which has no guest name, and a digest does not
   * need one.
   */
  stays: Array<{
    id?: string;
    propertyId: string;
    checkIn: string;
    checkOut: string;
    status?: string;
    partySize?: number | null;
    childCount?: number | null;
  }> | null;
  paceLive: boolean;
  preferenceTimes?: { arrival: Record<string, string | undefined>; departure: Record<string, string | undefined> } | null;
  compChoices: ReturnType<typeof loadCompChoices>;
}): ShadowDayRecord {
  if (!input.calendarLive) return { state: 'unread', digest: '' };
  const paceOf = (id: HouseId): YearPace =>
    !input.paceLive || !input.stays ? 'unknown' : grossPace(id, input.stays, input.asOf).stillNeeded > 0 ? 'short' : 'met';

  const comps = Object.fromEntries(
    HOUSES.map((house) => [house, chooseComps(house, input.compChoices[house] ?? { pinned: [], excluded: [] })]),
  ) as Record<HouseId, ReturnType<typeof compsFor>>;

  const digest = portfolioDigest({
    asOf: input.asOf,
    taken: input.taken,
    paused: input.paused,
    pace: { river: paceOf('river'), ranch: paceOf('ranch'), lindon: paceOf('lindon') },
    calendarLive: true,
    comps,
    closed: input.closed,
    ...(input.paceLive && input.stays ? { stays: input.stays } : {}),
    arrivalWindows: input.paceLive && input.preferenceTimes ? input.preferenceTimes.arrival : null,
    departureWindows: input.paceLive && input.preferenceTimes ? input.preferenceTimes.departure : null,
  });
  // A digest that saw no calendar must not be recorded: the clock would drop it anyway, and the host
  // would be told a day was saved when nothing counted.
  if (digest.includes(SHADOW_UNREAD)) return { state: 'unread', digest: '' };
  return { state: 'ready', digest };
}

/** Add today to a log, if the day is usable. Returns the log unchanged otherwise. */
export function withToday(log: readonly ShadowDay[], asOf: string, digest: string): ShadowDay[] {
  if (!digest) return [...log];
  return recordShadowDay(log, asOf, digest);
}

/**
 * Load the calendar this module needs, so a surface does not have to know how.
 *
 * Only the availability read: a surface that already holds the reservations passes them in rather
 * than fetching them again. Duplicate reads on the same page are what exhausted the daily KV limit on
 * 2026-11-07, so this deliberately does not read `/api/reservations` on its own.
 */
export async function loadShadowCalendar(): Promise<{
  taken: Record<HouseId, string[]>;
  closed: Record<HouseId, string[]>;
} | null> {
  const calendar = await loadQuoteCalendar().catch(() => null);
  if (!calendar) return null;
  return { taken: calendar.nights, closed: calendar.closed };
}

export { denverToday, usePreferenceTimes };


