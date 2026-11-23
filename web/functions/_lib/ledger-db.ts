/**
 * Row storage for bookings and expenses.
 *
 * Cloudflare KV is eventually consistent. Reservations and expenses used to be one JSON blob
 * each (`reservations`, `customExpenses`). A PATCH read whichever edge copy it hit, changed one
 * row, and wrote the whole blob back — so a stale edge erased a newer stay, and the next read
 * flipped between the two copies for about a minute. D1 is transactional: one UPDATE touches one
 * id, and `WHERE version = ?` makes the second writer lose instead of overwriting.
 *
 * Until `ledger_meta.kv_imported_at` is set, callers keep using KV. After it is set, KV is not
 * written. A missing binding (the placeholder id, before `wrangler d1 create`) is the same as
 * "not migrated": the KV path stays in place.
 */
import type { SettingsEnv } from './kv';
import { forgetCached } from './request-cache';

export const KV_IMPORTED_AT = 'kv_imported_at';

const READY = Symbol('uml.ledgerReady');

export class VersionConflictError extends Error {
  readonly code = 'version_conflict';
  readonly current: unknown;
  constructor(current: unknown) {
    super('This row was saved somewhere else. Reload it and try the edit again.');
    this.name = 'VersionConflictError';
    this.current = current;
  }
}

export type D1Statement = {
  bind: (...values: unknown[]) => D1Statement;
  all: <T = Record<string, unknown>>() => Promise<{ results?: T[] }>;
  run: () => Promise<{ meta?: { changes?: number }; changes?: number }>;
};

export type LedgerDb = {
  prepare: (sql: string) => D1Statement;
  batch?: (statements: D1Statement[]) => Promise<Array<{ meta?: { changes?: number }; changes?: number }>>;
  exec?: (sql: string) => Promise<unknown>;
};

type ReadyBox = { [READY]?: boolean };

export function ledgerDatabase(env: SettingsEnv): LedgerDb | null {
  const db = env.LEDGER_DB;
  if (!db || typeof db.prepare !== 'function') return null;
  return db;
}

export function versionConflict(err: unknown): err is VersionConflictError {
  return err instanceof VersionConflictError || (err instanceof Error && err.name === 'VersionConflictError');
}

/** Drop the per-request answer so the next read sees a migration that just finished. */
export function setLedgerReady(env: SettingsEnv, ready: boolean): void {
  (env as ReadyBox)[READY] = ready;
}

/**
 * True only when this deployment has a D1 binding and the one-time KV import has been recorded.
 * A missing table (migration SQL not applied yet) is not ready — callers stay on KV.
 */
export async function ledgerReady(env: SettingsEnv): Promise<boolean> {
  const box = env as ReadyBox;
  if (typeof box[READY] === 'boolean') return box[READY];
  const db = ledgerDatabase(env);
  if (!db) {
    box[READY] = false;
    return false;
  }
  try {
    const row = await one<{ value: string }>(env, 'SELECT value FROM ledger_meta WHERE key = ?', KV_IMPORTED_AT);
    box[READY] = Boolean(row?.value);
  } catch {
    box[READY] = false;
  }
  return box[READY]!;
}

export async function one<T>(env: SettingsEnv, sql: string, ...binds: unknown[]): Promise<T | null> {
  const db = ledgerDatabase(env);
  if (!db) return null;
  const result = await db.prepare(sql).bind(...binds.map(nullify)).all<T>();
  return result.results?.[0] ?? null;
}

export async function many<T>(env: SettingsEnv, sql: string, ...binds: unknown[]): Promise<T[]> {
  const db = ledgerDatabase(env);
  if (!db) return [];
  const result = await db.prepare(sql).bind(...binds.map(nullify)).all<T>();
  return result.results ?? [];
}

export async function run(env: SettingsEnv, sql: string, ...binds: unknown[]): Promise<number> {
  const db = ledgerDatabase(env);
  if (!db) throw new Error('The ledger database is not bound.');
  const result = await db.prepare(sql).bind(...binds.map(nullify)).run();
  const changes = result.meta?.changes ?? result.changes;
  return typeof changes === 'number' ? changes : 0;
}

export async function runBatch(
  env: SettingsEnv,
  statements: Array<{ sql: string; binds: unknown[] }>,
): Promise<number> {
  const db = ledgerDatabase(env);
  if (!db) throw new Error('The ledger database is not bound.');
  if (statements.length === 0) return 0;
  if (db.batch) {
    const prepared = statements.map((statement) => db.prepare(statement.sql).bind(...statement.binds.map(nullify)));
    const results = await db.batch(prepared);
    return results.reduce((sum, result) => sum + (result.meta?.changes ?? result.changes ?? 0), 0);
  }
  if (db.exec) await db.exec('BEGIN');
  try {
    let changes = 0;
    for (const statement of statements) changes += await run(env, statement.sql, ...statement.binds);
    if (db.exec) await db.exec('COMMIT');
    return changes;
  } catch (err) {
    if (db.exec) await db.exec('ROLLBACK');
    throw err;
  }
}

export function forgetLedgerLists(env: SettingsEnv): void {
  forgetCached(env, 'ledger:reservations');
  forgetCached(env, 'ledger:overrides');
  forgetCached(env, 'ledger:expenses');
}

/**
 * `If-Match: "3"` or `{ expectedVersion: 3 }`. Absent means the caller did not claim a version.
 * A present but unreadable token is `'invalid'` so the route can 400 instead of guessing.
 */
export function readExpectedVersion(
  request: Request,
  body?: { expectedVersion?: unknown },
): number | undefined | 'invalid' {
  const header = request.headers.get('If-Match');
  if (header !== null && header.trim() !== '' && header.trim() !== '*') {
    const token = header.trim().replace(/^W\//i, '').replace(/^"/, '').replace(/"$/, '');
    if (!/^\d+$/.test(token)) return 'invalid';
    return Number(token);
  }
  if (!body || body.expectedVersion === undefined || body.expectedVersion === null || body.expectedVersion === '') {
    return undefined;
  }
  const value = typeof body.expectedVersion === 'number' ? body.expectedVersion : Number(body.expectedVersion);
  if (!Number.isInteger(value) || value < 0) return 'invalid';
  return value;
}

export function canonicalJson(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
}

function nullify(value: unknown): unknown {
  return value === undefined ? null : value;
}
