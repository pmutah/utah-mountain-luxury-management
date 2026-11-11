/**
 * Offline ticks for the cleaner's link.
 *
 * The plan calls for a cleaner PWA that works offline. The page as it stood awaited the server on every tick and, when the
 * fetch failed, **the tick simply vanished**: a cleaner at a canyon house with no signal tapped their way down a checklist and
 * the phone quietly dropped every mark. They would have no way to know their work was not recorded.
 *
 * This keeps three things in `localStorage`, keyed by the cleaner's token so two links on one phone cannot mix:
 *
 *   1. the last list the server sent, so the page opens with work to do instead of an error;
 *   2. the ticks made on this phone, whether or not they reached the server;
 *   3. a queue of turns whose ticks have not been confirmed.
 *
 * The rule this module exists to enforce: **a tick is never lost and never silently claimed.** A tick that did not reach the
 * server is shown as "not sent yet", not as saved.
 */

export type OfflineTick = { house: string; checkout: string; done: string[] };

const PREFIX = 'uml.clean.';

export function turnKey(house: string, checkout: string): string {
  return `${house}:${checkout}`;
}

function key(token: string, part: 'jobs' | 'ticks' | 'queue'): string {
  // The token is a credential, so it is not stored in the clear as a key; a short hash is enough to separate two links.
  return `${PREFIX}${part}.${hash(token)}`;
}

/** A stable, non-reversible tag for a token. Nothing is recovered from it. */
function hash(value: string): string {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function read<T>(store: Storage | undefined, name: string): T | null {
  if (!store) return null;
  try {
    const text = store.getItem(name);
    return text ? (JSON.parse(text) as T) : null;
  } catch {
    return null;
  }
}

function write(store: Storage | undefined, name: string, value: unknown): void {
  if (!store) return;
  try {
    store.setItem(name, JSON.stringify(value));
  } catch {
    // A full or blocked store must not break the page. The tick stays in memory and the page says it is unsent.
  }
}

export function loadCachedJobs<T>(store: Storage | undefined, token: string): T | null {
  return read<T>(store, key(token, 'jobs'));
}

export function saveCachedJobs(store: Storage | undefined, token: string, jobs: unknown): void {
  write(store, key(token, 'jobs'), jobs);
}

/** Ticks made on this phone that the server has not confirmed. */
export function loadQueue(store: Storage | undefined, token: string): OfflineTick[] {
  const queue = read<OfflineTick[]>(store, key(token, 'queue'));
  if (!Array.isArray(queue)) return [];
  return queue.filter(
    (row): row is OfflineTick =>
      Boolean(row) && typeof row.house === 'string' && typeof row.checkout === 'string' && Array.isArray(row.done),
  );
}

export function saveQueue(store: Storage | undefined, token: string, queue: readonly OfflineTick[]): void {
  write(store, key(token, 'queue'), queue);
}

/**
 * Record a tick on this phone and queue it.
 *
 * A turn appears in the queue once, carrying its **latest** full tick list. Two ticks on the same turn before a send collapse
 * into one entry rather than a growing log, because the server takes the whole list for a turn.
 */
export function queueTick(store: Storage | undefined, token: string, tick: OfflineTick): OfflineTick[] {
  const queue = loadQueue(store, token).filter(
    (row) => !(row.house === tick.house && row.checkout === tick.checkout),
  );
  const next = [...queue, tick];
  saveQueue(store, token, next);
  return next;
}

/** The server confirmed this turn, so it leaves the queue. */
export function clearSent(store: Storage | undefined, token: string, house: string, checkout: string): OfflineTick[] {
  const next = loadQueue(store, token).filter((row) => !(row.house === house && row.checkout === checkout));
  saveQueue(store, token, next);
  return next;
}

/** What this phone knows about one turn, merged with what the server last sent. */
export function mergeDone(server: readonly string[], phone: readonly string[]): string[] {
  const out = new Set(server);
  for (const id of phone) out.add(id);
  return [...out];
}

/**
 * One line for the page. It must never let a cleaner believe an unsent tick was recorded.
 *
 * `online` is the browser's own signal, which is not the same as "the server answered" — a phone on one bar reports online
 * and still fails the POST — so the wording is about what happened, not about the radio.
 */
export function offlineLine(input: { unsent: number; online: boolean; saving: boolean }): string {
  if (input.unsent === 0) {
    return input.online ? '' : 'Offline. Your ticks are kept on this phone; nothing is waiting to send.';
  }
  const count = input.unsent === 1 ? '1 turn' : `${input.unsent} turns`;
  if (input.saving) return `Sending ${count}…`;
  return input.online
    ? `${count} not sent yet. They are kept on this phone and will send when the signal holds.`
    : `Offline. ${count} kept on this phone and will send when the signal returns.`;
}
