/** Denver days the shadow run finished on this browser. This module never sends a rate. */

export const SHADOW_DAYS_REQUIRED = 7;
export const SHADOW_LOG_KEY = 'uml-shadow-log';

export type ShadowDay = {
  date: string;
  digest: string;
};

export type ShadowClock = {
  days: number;
  required: number;
  ready: boolean;
  dates: string[];
};

type ShadowStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A shadow day that includes this line did not see the calendar, so it does not count. */
export const SHADOW_UNREAD = 'The calendar could not be read. No night is raised or promoted.';

function browserStore(): ShadowStore | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

function isDay(value: unknown): value is ShadowDay {
  if (!value || typeof value !== 'object') return false;
  const day = value as ShadowDay;
  return DATE.test(day.date) && typeof day.digest === 'string' && day.digest.includes('Nothing sent to Hospitable.');
}

/** Keep one row per Denver day. A digest that could be sent is refused. */
export function recordShadowDay(log: readonly ShadowDay[], date: string, digest: string): ShadowDay[] {
  if (!DATE.test(date) || !digest.includes('Nothing sent to Hospitable.')) return log.filter(isDay);
  if (digest.includes(SHADOW_UNREAD)) return log.filter((day) => isDay(day) && day.date !== date);
  const kept = log.filter((day) => isDay(day) && day.date !== date);
  return [...kept, { date, digest }].sort((a, b) => a.date.localeCompare(b.date)).slice(-14);
}

export function shadowClock(log: readonly ShadowDay[], today: string): ShadowClock {
  const dates = [...new Set(log.filter(isDay).map((day) => day.date))]
    .filter((date) => DATE.test(today) && date <= today)
    .sort();
  return {
    days: Math.min(dates.length, SHADOW_DAYS_REQUIRED),
    required: SHADOW_DAYS_REQUIRED,
    ready: dates.length >= SHADOW_DAYS_REQUIRED,
    dates,
  };
}

/** Both the week of shadow and a write token have to be true. Calling this does not send. */
export function hospitablePushAllowed(ready: boolean, hasWriteToken: boolean): boolean {
  return ready && hasWriteToken;
}

/**
 * The clock the server keeps. A day counts only when it finished with the calendar read and its
 * digest was never sendable. The newest day wins, so a replay cannot invent a week.
 */
export type SavedShadowDay = { date: string; digest: string; savedAt?: string };

export function shadowClockFromSaved(days: readonly SavedShadowDay[], today: string): ShadowClock {
  const usable = days.filter(
    (day) =>
      DATE.test(day.date) &&
      typeof day.digest === 'string' &&
      day.digest.includes('Nothing sent to Hospitable.') &&
      !day.digest.includes(SHADOW_UNREAD) &&
      DATE.test(today) &&
      day.date <= today,
  );
  const dates = [...new Set(usable.map((day) => day.date))].sort();
  return {
    days: Math.min(dates.length, SHADOW_DAYS_REQUIRED),
    required: SHADOW_DAYS_REQUIRED,
    ready: dates.length >= SHADOW_DAYS_REQUIRED,
    dates,
  };
}

/**
 * Merge one day into the saved list. A day that saw no calendar removes that date rather than
 * leaving an older digest behind. The list keeps two weeks.
 */
export function mergeSavedShadowDay(days: readonly SavedShadowDay[], next: SavedShadowDay): SavedShadowDay[] {
  const kept = days.filter(
    (day) => day.date !== next.date && DATE.test(day.date) && typeof day.digest === 'string',
  );
  if (next.digest.includes(SHADOW_UNREAD) || !next.digest.includes('Nothing sent to Hospitable.')) {
    return kept.sort((a, b) => a.date.localeCompare(b.date)).slice(-14);
  }
  const row: SavedShadowDay = { date: next.date, digest: next.digest };
  if (next.savedAt) row.savedAt = next.savedAt;
  return [...kept, row].sort((a, b) => a.date.localeCompare(b.date)).slice(-14);
}

export function shadowClockLine(clock: ShadowClock): string {
  if (clock.ready) {
    return `Shadow days ${clock.days} of ${clock.required} are on this browser. A Hospitable write stays closed until a write token exists.`;
  }
  const left = clock.required - clock.days;
  const noun = left === 1 ? 'day' : 'days';
  return `Shadow day ${clock.days} of ${clock.required}. ${left} more Denver ${noun} before a rate can be sent. Nothing is sent to Hospitable.`;
}

export function loadShadowLog(store: ShadowStore | null = browserStore()): ShadowDay[] {
  if (!store) return [];
  try {
    const raw = store.getItem(SHADOW_LOG_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isDay).slice(-14);
  } catch {
    return [];
  }
}

export function saveShadowLog(log: readonly ShadowDay[], store: ShadowStore | null = browserStore()) {
  if (!store) return;
  try {
    store.setItem(SHADOW_LOG_KEY, JSON.stringify(log.filter(isDay).slice(-14)));
  } catch {
    // The clock still shows for this visit.
  }
}
