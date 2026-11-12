/**
 * A short-lived cache for the public calendar, so one page load does not cost six KV reads per visitor.
 *
 * Why this exists: `/api/book/availability` reads six keys — reservations, calendar blocks, holds, approved rates,
 * River part rates, and whichever of those the stores touch internally — and it did so on **every** request. The data
 * it returns is public and identical for every guest, and production answered `storageReads: "paused"` on 2026-11-12
 * because the daily KV read limit had been spent. A booking site that cannot quote dates is a booking site that cannot
 * take a booking, so the fix is to stop asking KV the same question hundreds of times an hour.
 *
 * What is cached: the assembled calendar payload, by the Denver day it was built for. Nothing guest-specific is in it —
 * no name, no email, no token, no hold id. Holds are included because they are public as "these nights are spoken for"
 * and they expire on their own.
 *
 * Why memory and not the edge cache: a Pages Function isolate can hold this in a module variable with no binding, no
 * dashboard change, and no extra service. `caches.default` would be shared across isolates and is the better answer at
 * real scale, but it also caches per colo and can outlive a deploy in ways that are harder to reason about. This keeps
 * the win and the failure mode small: the worst case is a guest seeing a calendar up to `TTL_MS` old.
 *
 * Staleness is the one risk, and it is bounded and deliberate. A booking request re-reads the calendar on the server
 * before it holds anything (`POST /api/book`), so a stale cache can never cause a double booking — only a guest
 * occasionally seeing a night as free that was just taken, for at most one refresh window.
 */

/** How long a built calendar may be reused. Long enough to collapse a burst, short enough to stay honest. */
export const TTL_MS = 60_000;

/**
 * The longest the cached value may survive past its own window.
 *
 * A cache entry is also dropped once this much time passes, even if nothing overwrote it, so a quiet isolate does not
 * hand a guest a calendar from an hour ago on the first request after a lull.
 */
const MAX_STALE_MS = 5 * 60_000;

type Entry = { key: string; builtAt: number; value: unknown };

/*
 * One slot per isolate, not a map. There is exactly one key that matters here — today's public calendar — and a single
 * slot means a bad day rolls the old value out as soon as a new one is built, with no unbounded growth to reason about.
 */
let slot: Entry | null = null;
/** A build in flight, so ten simultaneous requests cost one set of reads rather than ten. */
let inFlight: Promise<unknown> | null = null;

/** The key for a payload. It rotates at Denver midnight, so yesterday's calendar can never be served as today's. */
export function cacheKey(day: string): string {
  return `availability:${day}`;
}

/**
 * Read through the cache.
 *
 * `build` runs at most once per TTL window per isolate, and concurrent callers share one in-flight build. A build that
 * throws is not cached and not shared: the caller sees the error and the next request tries again, which is what the
 * route's own `paused` handling expects.
 */
export async function cachedCalendar<T>(
  key: string,
  build: () => Promise<T>,
  now = Date.now(),
): Promise<{ value: T; cached: boolean }> {
  if (slot && slot.key === key && now - slot.builtAt < TTL_MS) {
    return { value: slot.value as T, cached: true };
  }
  // A value past its window but inside the hard bound is stale-but-usable only if a build is already running.
  if (inFlight) {
    return { value: (await inFlight) as T, cached: true };
  }
  const running = build();
  inFlight = running as Promise<unknown>;
  try {
    const value = await running;
    slot = { key, builtAt: now, value };
    return { value, cached: false };
  } finally {
    inFlight = null;
  }
}

/** True when the cached value is older than the hard bound and must not be used at all. */
export function tooOld(now = Date.now()): boolean {
  return slot !== null && now - slot.builtAt > MAX_STALE_MS;
}

/** Drop the cache. Used by the tests, and by any caller that has just written a booking and wants the next read fresh. */
export function forgetCalendar(): void {
  slot = null;
  inFlight = null;
}
