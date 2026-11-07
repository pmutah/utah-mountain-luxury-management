import type { SettingsEnv } from './kv';
import { cachedGet, forgetCached, peekCached } from './request-cache';

export class StorageReadError extends Error {
  constructor(message = 'Saved records could not be read. Storage reads are paused for the rest of the day.') {
    super(message);
    this.name = 'StorageReadError';
  }
}

export function storageReadPaused(err: unknown): boolean {
  if (err instanceof StorageReadError) return true;
  const message = err instanceof Error ? err.message : String(err);
  return /limit exceeded|too many requests/i.test(message);
}

export async function kvGet<T>(env: SettingsEnv, key: string, fallback: T): Promise<T> {
  if (!env.SETTINGS) return fallback;
  /*
   * One read per key per request. A single dashboard load reaches the same key from more than one
   * place, and on 2026-11-07 production hit its daily KV read limit — a page load spent eight reads
   * for four values. Caching here covers every store at once, because they all read through this.
   */
  return cachedGet(
    env,
    async () => {
      let raw: string | null;
      try {
        raw = await env.SETTINGS!.get(key);
      } catch (err) {
        /*
         * A failed read is not an absent key, and this distinction is the whole safety of the
         * ledger. `raw === null` means the key was never written, so the caller's default is the
         * truth. A throw means we do not know what is there — and returning the default anyway
         * let a caller read `[]` and then save it back. A single create on a flaky connection
         * replaced 86 bookings with the one it had just made, because the only guard was on a
         * *completely* empty list. Every failed read is now a refusal.
         */
        throw storageReadPaused(err) ? new StorageReadError() : new StorageReadError(
          `Saved records could not be read (${key}). Nothing was written.`,
        );
      }
      // Never written. The caller's default is correct here.
      if (raw === null || raw === '') return fallback;
      try {
        return JSON.parse(raw) as T;
      } catch {
        // A saved value that will not parse is also not an empty list. Guessing here would let the
        // next save overwrite whatever is actually stored.
        throw new StorageReadError(`Saved records could not be read (${key}). Nothing was written.`);
      }
    },
    `kv:${key}`,
  );
}

/**
 * Keys whose whole point is the list they hold. Writing a shorter one over them is how bookings and
 * expenses get lost, so they are guarded here rather than trusted to every caller.
 */
const LEDGER_KEYS = new Set(['customExpenses', 'reservations']);

/** Rows that are not turnover cleaning: those are derived from stays and may legitimately go. */
function ledgerRows(value: readonly unknown[]): number {
  return value.filter((row) => {
    const id = row && typeof row === 'object' ? String((row as { id?: unknown }).id ?? '') : '';
    return !id.startsWith('clean-');
  }).length;
}

export async function kvPut<T>(
  env: SettingsEnv,
  key: string,
  value: T,
  options: { allowShrinkReason?: string } = {},
): Promise<T> {
  if (LEDGER_KEYS.has(key) && Array.isArray(value)) {
    /*
     * An empty list was already refused, but that was the wrong test. A read that failed and fell
     * back to `[]` produced a *one-row* list, which passed this check, so a single create on a flaky
     * connection replaced 86 bookings with the one it had just made. The invariant is not "not
     * empty", it is "not fewer than what is already saved", so the check compares against storage.
     */
    if (value.length === 0) throw new Error('Refusing to replace a saved list with an empty one.');
    if (env.SETTINGS) {
      /*
       * Prefer the read this request already made. Most routes load the ledger before saving it, so
       * this guard is free in the common case; it only spends a read when the caller never loaded
       * the list, which is exactly when the guard is most needed.
       */
      const cached = peekCached<unknown>(env, `kv:${key}`);
      const raw =
        cached !== undefined
          ? JSON.stringify(await cached)
          : await env.SETTINGS.get(key);
      if (raw) {
        let previous: unknown = null;
        try {
          previous = JSON.parse(raw);
        } catch {
          // The stored value will not parse. Writing over it would be the only copy gone.
          throw new Error('Refusing to write over a saved list that could not be read.');
        }
        if (Array.isArray(previous) && ledgerRows(value) < ledgerRows(previous)) {
          /*
           * A deliberate deletion is allowed, but only with a reason attached, so the one path that
           * removes a row says so at the call site. A shrink with no reason is the shape of every
           * accidental wipe this guard exists to stop.
           */
          const reason = (options.allowShrinkReason ?? '').trim();
          if (reason.length === 0) {
            throw new Error(
              `Refusing to write ${ledgerRows(value)} saved rows over ${ledgerRows(previous)}: this would lose records. Nothing was written.`,
            );
          }
        }
      }
    }
  }
  if (env.SETTINGS) {
    await env.SETTINGS.put(key, JSON.stringify(value));
  }
  // A read later in this same request must see the save, not the value cached before it.
  forgetCached(env, `kv:${key}`);
  return value;
}

export function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
