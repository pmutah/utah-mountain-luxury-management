/**
 * Read the store once per request, not once per call site.
 *
 * One dashboard load calls `mergeAllExpenses` and `getAllReservations` from more than one place, and
 * the metrics and history routes each read the same four keys. On 2026-11-07 production hit its daily
 * KV read limit, and the request fan-out was part of the cost: a single page load spent eight reads
 * for four values.
 *
 * The cache lives on the env object, which Cloudflare creates fresh for each request. That is what
 * makes it safe: it cannot outlive the request, so a value written during the request is never served
 * stale to a later one.
 *
 * Reads only. A `put` clears the matching key, so a save followed by a read in the same request sees
 * the new value rather than the one loaded a moment earlier.
 */
const CACHE = Symbol('uml.storeCache');
const READ_STATS = Symbol('uml.readStats');

type CacheBox = { [CACHE]?: Map<string, Promise<unknown>>; [READ_STATS]?: { reads: number; hits: number } };

function box(env: unknown): CacheBox {
  if (!env || typeof env !== 'object') return {};
  return env as CacheBox;
}

/**
 * One key, read at most once per request. The promise is cached rather than the value, so two
 * callers arriving at the same time share one read instead of racing.
 */
export async function cachedGet<T>(
  env: unknown,
  get: () => Promise<T>,
  key: string,
): Promise<T> {
  const holder = box(env);
  const cache = (holder[CACHE] ??= new Map());
  const stats = (holder[READ_STATS] ??= { reads: 0, hits: 0 });
  const existing = cache.get(key) as Promise<T> | undefined;
  if (existing) {
    stats.hits += 1;
    return existing;
  }
  stats.reads += 1;
  const pending = get();
  cache.set(key, pending);
  // A failed read must not stay cached, or every later call in the request would replay the failure.
  pending.catch(() => cache.delete(key));
  return pending;
}

/** A save replaces the cached value, so a read after a write in the same request sees the new one. */
export function forgetCached(env: unknown, key: string): void {
  box(env)[CACHE]?.delete(key);
}

/**
 * The value already cached for one key, or undefined when this request has not read it.
 *
 * The ledger guard needs to know what is saved before it overwrites it, but reading KV again for
 * that would spend a second read on a key the route has almost always just read — and duplicate
 * reads are what exhausted the daily limit on 2026-11-07. This hands back the in-flight or settled
 * promise so the guard costs nothing when the route has already loaded the list.
 */
export function peekCached<T>(env: unknown, key: string): Promise<T> | undefined {
  return box(env)[CACHE]?.get(key) as Promise<T> | undefined;
}

/** How many reads this request actually made. Used by a test, not by a route. */
export function readStats(env: unknown): { reads: number; hits: number } {
  return box(env)[READ_STATS] ?? { reads: 0, hits: 0 };
}
