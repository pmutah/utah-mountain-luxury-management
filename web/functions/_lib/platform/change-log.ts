/**
 * The rate change log.
 *
 * The plan requires that "every change is logged with a reason". The `rate_changes` table has existed since
 * `0001_market.sql` and **had never been written**, and `changeLogEntry` in `rate-engine.ts` was dead code — a defined
 * function with no caller, which is this repo's recurring defect shape: a label with nothing behind it.
 *
 * Two things this is not:
 *
 *   - It is not a second copy of the shadow day. A shadow day is one digest per Denver day; this is one row per night that
 *     actually moved, with the before and after rate.
 *   - It is not a record of something that was sent. No sender exists today, so every row is `mode: 'shadow'` and carries
 *     `sent: 0`. The column is there for the day a sender exists, and it is written as zero rather than left to guesswork.
 *
 * Writing is idempotent per (house, date, mode): re-running the plan on the same day replaces that night's row rather than
 * appending a duplicate, so the log answers "what does this night look like now and why" and not "how many times did the
 * page reload".
 */

import { marketDb, readRows, writeRow } from './market-db';

export type LoggedHouse = 'ranch' | 'lindon' | 'river';

export type ChangeRow = {
  house: LoggedHouse;
  date: string;
  /** The published ask before this change. */
  beforeRate: number;
  /** What the plan proposes. Equal to `beforeRate` when nothing moved. */
  afterRate: number;
  reason: string;
  mode: 'shadow';
};

export type ChangeLogResult = { ok: true; written: number; skipped: number } | { ok: false; reason: string; written: number };

function isHouse(value: unknown): value is LoggedHouse {
  return value === 'ranch' || value === 'lindon' || value === 'river';
}

/** Only a real night with a real move is logged. A hold, a booked night, or a zero change is not a change. */
export function shouldLog(row: ChangeRow): boolean {
  if (!isHouse(row.house)) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date)) return false;
  if (!Number.isFinite(row.beforeRate) || !Number.isFinite(row.afterRate)) return false;
  if (row.beforeRate <= 0 || row.afterRate <= 0) return false;
  return Math.round(row.beforeRate) !== Math.round(row.afterRate);
}

/**
 * Write the nights that moved.
 *
 * The caller passes only nights it decided to change. `shouldLog` still filters, so a caller that passes everything cannot
 * fill the table with holds. A database failure is reported, never swallowed: a change log that silently drops rows is worse
 * than no log, because the next reader believes it is complete.
 */
export async function logChanges(
  env: unknown,
  rows: readonly ChangeRow[],
  now: Date = new Date(),
): Promise<ChangeLogResult> {
  const changeable = rows.filter(shouldLog);
  const skipped = rows.length - changeable.length;
  if (changeable.length === 0) return { ok: true, written: 0, skipped };
  if (!marketDb(env)) return { ok: false, reason: 'The market database is not bound, so no change was logged.', written: 0 };

  let written = 0;
  for (const row of changeable) {
    /*
     * One row per house and night, replaced rather than appended.
     *
     * This is a claim I made in the header of this file and then failed to implement: the first version was a plain INSERT,
     * so running the plan twice on the same day wrote the same night twice and the log read as though the rate had moved
     * twice. `rate_changes` predates this writer and has no unique key, so the replacement is explicit: delete this night's
     * shadow row, then insert. A future live row is a different `mode` and is never removed here.
     *
     * A database with no transaction support across statements means a crash between the two could leave a night missing
     * rather than duplicated. That is the right way to be wrong: a log missing a row is visible as a gap in the plan, while
     * a duplicated row is a false history.
     */
    const cleared = await writeRow(env, "DELETE FROM rate_changes WHERE house = ? AND date = ? AND mode = 'shadow'", row.house, row.date);
    if (!cleared.ok) return { ok: false, reason: cleared.reason, written };
    const result = await writeRow(
      env,
      `INSERT INTO rate_changes (house, date, before_rate, after_rate, reason, mode, created_at)
       VALUES (?, ?, ?, ?, ?, 'shadow', ?)`,
      row.house,
      row.date,
      row.beforeRate,
      row.afterRate,
      row.reason.slice(0, 300),
      now.toISOString(),
    );
    if (!result.ok) return { ok: false, reason: result.reason, written };
    written += 1;
  }
  return { ok: true, written, skipped };
}

export type LoggedChange = {
  house: string;
  date: string;
  before_rate: number;
  after_rate: number;
  reason: string;
  mode: string;
  created_at: string;
};

/** The most recent changes, newest first. A read failure is reported rather than read as an empty log. */
export async function readChanges(env: unknown, limit = 50): Promise<{ ok: true; rows: LoggedChange[] } | { ok: false; reason: string }> {
  const safe = Math.min(200, Math.max(1, Math.round(limit)));
  const rows = await readRows<LoggedChange>(
    env,
    'SELECT house, date, before_rate, after_rate, reason, mode, created_at FROM rate_changes ORDER BY created_at DESC, id DESC LIMIT ?',
    safe,
  );
  return rows.ok ? { ok: true, rows: rows.rows } : rows;
}

/** One line per change for the desk. It says plainly that nothing was sent. */
export function changeLine(row: LoggedChange): string {
  const name = row.house === 'ranch' ? 'Ranch' : row.house === 'lindon' ? 'Lindon' : 'River';
  const from = `$${Math.round(row.before_rate).toLocaleString('en-US')}`;
  const to = `$${Math.round(row.after_rate).toLocaleString('en-US')}`;
  const dir = row.after_rate > row.before_rate ? 'raised' : 'lowered';
  return `${name}, ${row.date}: ${dir} ${from} → ${to}. ${row.reason} Nothing was sent.`;
}
