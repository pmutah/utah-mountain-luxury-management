/**
 * The append-only audit log.
 *
 * `appendAudit` in `src/lib/platform/back-office.ts` and the plan's M6 requirement ("every change is logged") shared the
 * same defect as the kill switch and the change log: a rule that existed only in a test. Nothing wrote an entry, so there was
 * no record of who changed an expense, removed a receipt, or archived a booking.
 *
 * What this records: **who** (a role and, when known, an email), **what** (an action name), **which row**, and **when**. What
 * it never records: the amount of a bill, a guest name, a phone, a door code, a receipt body. An audit trail that leaks the
 * detail it is meant to protect is a second copy of the problem.
 *
 * Storage is KV under one key. It is append-only in the sense that matters: nothing in this module removes an entry, and a
 * bulk delete is refused before it is written. The list is capped so a long history cannot grow without bound — the cap drops
 * the **oldest** entries, which is the right way to lose history.
 */

import { kvGet, kvPut, storageReadPaused } from '../kv-json';
import type { SettingsEnv } from '../kv';

const KV_KEY = 'auditLog';

/** Entries kept. Each is a few hundred bytes at most, and a month of a three-house operation fits easily. */
export const AUDIT_LIMIT = 2000;

/** Actions whose name alone means "remove many rows". Refused outright, before anything is written. */
const BULK_DELETE = /^(bulk-delete|delete-expenses|delete-reservations|purge-expenses|wipe)/i;

export type AuditActor = {
  role: 'admin' | 'owner' | 'cleaner' | 'vendor' | 'bot' | 'guest';
  /** An address when the caller signed in by email. Never a name, never a phone. */
  email?: string;
};

export type AuditEntry = {
  at: string;
  actor: AuditActor;
  /** A stable verb-noun: `expense.create`, `expense.update`, `expense.remove`, `receipt.attach`, `receipt.remove`. */
  action: string;
  /** What was touched. An expense id, a booking id, a receipt path. Not a description of the contents. */
  target: string;
  /** Free text a route wants to keep, already stripped of anything private by the caller. Optional. */
  note?: string;
};

export type AuditResult =
  | { ok: true; written: boolean; entries: number }
  /** Refused by policy. Nothing was written. */
  | { ok: false; reason: string };

/** True when this action is a bulk removal, which the platform refuses to record because it refuses to do. */
export function isBulkDelete(action: string): boolean {
  return BULK_DELETE.test(action.trim());
}

/**
 * Read the log. A failed read is **not** an empty log.
 *
 * `ok: false` must be surfaced rather than rendered as "no changes have been made", which is the same mistake this codebase
 * has made with every other store.
 */
export async function readAudit(
  env: SettingsEnv,
  limit = 100,
): Promise<{ ok: true; entries: AuditEntry[] } | { ok: false; reason: string }> {
  try {
    const saved = await kvGet<AuditEntry[]>(env, KV_KEY, []);
    if (!Array.isArray(saved)) return { ok: false, reason: 'The audit log is not a list.' };
    const safe = saved.filter(
      (row): row is AuditEntry =>
        Boolean(row) && typeof row.at === 'string' && typeof row.action === 'string' && Boolean(row.actor),
    );
    const cap = Math.min(500, Math.max(1, Math.round(limit)));
    // Newest first, so a reader sees the recent past without paging.
    return { ok: true, entries: [...safe].reverse().slice(0, cap) };
  } catch (err) {
    if (storageReadPaused(err)) return { ok: false, reason: 'Saved records could not be read. Nothing was written.' };
    return { ok: false, reason: err instanceof Error ? err.message : 'The audit log could not be read.' };
  }
}

/**
 * Append one entry.
 *
 * A refusal is returned, never thrown: a route that cannot record an audit entry should decide what to do about that, and a
 * crash in the middle of a write is the wrong answer. The caller decides whether an unloggable change still proceeds — for a
 * receipt removal it does not, and for a routine expense edit it does, and both say so in their own response.
 */
export async function audit(
  env: SettingsEnv,
  entry: Omit<AuditEntry, 'at'> & { at?: string },
  now: Date = new Date(),
): Promise<AuditResult> {
  if (isBulkDelete(entry.action)) {
    return { ok: false, reason: 'A bulk delete of expenses or reservations is refused, and is not logged as one.' };
  }
  let saved: AuditEntry[];
  try {
    saved = await kvGet<AuditEntry[]>(env, KV_KEY, []);
  } catch (err) {
    if (storageReadPaused(err)) return { ok: false, reason: 'Saved records could not be read, so the change was not logged.' };
    return { ok: false, reason: err instanceof Error ? err.message : 'The audit log could not be read.' };
  }
  const list = Array.isArray(saved) ? saved : [];
  const next = [
    ...list,
    {
      at: entry.at ?? now.toISOString(),
      actor: entry.actor,
      action: entry.action,
      target: entry.target,
      ...(entry.note ? { note: entry.note.slice(0, 200) } : {}),
    },
  ];
  // The cap drops the oldest, so the recent past survives.
  const trimmed = next.length > AUDIT_LIMIT ? next.slice(next.length - AUDIT_LIMIT) : next;
  try {
    await kvPut(env, KV_KEY, trimmed);
  } catch (err) {
    if (storageReadPaused(err)) return { ok: false, reason: 'Saved records could not be written, so the change was not logged.' };
    return { ok: false, reason: err instanceof Error ? err.message : 'The audit log could not be written.' };
  }
  return { ok: true, written: true, entries: trimmed.length };
}

/**
 * One line for the desk. It names the action and the row, and it does not repeat any amount or guest detail.
 */
export function auditLine(entry: AuditEntry): string {
  const who = entry.actor.email ? `${entry.actor.role} ${entry.actor.email}` : entry.actor.role;
  const when = entry.at.slice(0, 16).replace('T', ' ');
  const note = entry.note ? ` ${entry.note}` : '';
  return `${when} — ${who}: ${entry.action} on ${entry.target}.${note}`;
}
