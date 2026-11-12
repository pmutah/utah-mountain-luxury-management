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

/**
 * A saved day is a day whose digest could be sent **and** was built from real comps.
 *
 * The fit line names its own source. A digest from the sample fixtures says "sample comps". A digest that
 * never mentions comps at all used to pass, because the check only looked for the sample phrase — seven of
 * those would have opened the rate gate on a market nobody measured. A day counts only when it says it saw
 * saved comps and does not say it saw samples. Applying this here covers both the local log and the saved
 * one, since both read a day through this guard.
 */
function isDay(value: unknown): value is ShadowDay {
  if (!value || typeof value !== 'object') return false;
  const day = value as ShadowDay;
  return (
    DATE.test(day.date) &&
    typeof day.digest === 'string' &&
    day.digest.includes('Nothing sent to Hospitable.') &&
    daySawRealComps(day.digest)
  );
}

/** Keep one row per Denver day. A digest that could be sent, or that was built from sample comps, is refused. */
export function recordShadowDay(log: readonly ShadowDay[], date: string, digest: string): ShadowDay[] {
  if (!DATE.test(date) || !digest.includes('Nothing sent to Hospitable.')) return log.filter(isDay);
  if (digest.includes(SHADOW_UNREAD)) return log.filter((day) => isDay(day) && day.date !== date);
  /*
   * A day built from the sample fixtures is refused at the write, not stored and then ignored on read.
   * Writing it and having `isDay` reject it was the worst of both: the day was silently dropped from the
   * clock while pretending to be saved, and the log carried a row that could never count.
   */
  if (!daySawRealComps(digest)) return log.filter(isDay);
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

/**
 * A saved day counts only when its digest was built from **real comps**.
 *
 * The recorded digest names its own source in the fit line: a day computed from the sample fixtures says
 * "sample comps", and one built from the saved comps says "saved comps". Silence is not a third kind of
 * proof. A morning line that never mentions comps used to pass this check, and seven of those would have
 * opened the rate gate. A day counts only when it names saved comps and does not name samples. A mixed
 * digest — one house saved, another still on the fixtures — does not count. The row can stay in the log;
 * only its eligibility is denied.
 */
export function daySawRealComps(digest: string): boolean {
  if (/sample comps?/i.test(digest)) return false;
  return /saved comps?/i.test(digest);
}

export function shadowClockFromSaved(days: readonly SavedShadowDay[], today: string): ShadowClock {
  const usable = days.filter(
    (day) =>
      DATE.test(day.date) &&
      typeof day.digest === 'string' &&
      day.digest.includes('Nothing sent to Hospitable.') &&
      daySawRealComps(day.digest) &&
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

export function shadowClockLine(clock: ShadowClock, where: 'server' | 'browser' = 'browser'): string {
  const place = where === 'server' ? 'on the server' : 'on this browser';
  if (clock.ready) {
    return `Shadow days ${clock.days} of ${clock.required} are ${place}. A Hospitable write stays closed until a write token exists.`;
  }
  const left = clock.required - clock.days;
  const noun = left === 1 ? 'day' : 'days';
  return `Shadow day ${clock.days} of ${clock.required} ${place}. ${left} more Denver ${noun} before a rate can be sent. Nothing is sent to Hospitable.`;
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
