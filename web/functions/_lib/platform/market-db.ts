/**
 * The market database.
 *
 * Only new tables live here: comps, comp nights, rate changes, the feature registry, funnel events, and A/B
 * assignments. Expenses, bookings, receipts, construction, e-sign, guides, and calendar state stay in KV exactly
 * where they are. Nothing in this module reads or writes a book.
 *
 * Every function tolerates a missing binding and a failing query: a desk that cannot reach D1 must say so, not throw.
 */

export type D1Result<T = Record<string, unknown>> = { results?: T[] };

export type D1Statement = {
  bind: (...values: unknown[]) => D1Statement;
  all: <T = Record<string, unknown>>() => Promise<D1Result<T>>;
  run: () => Promise<unknown>;
};

export type D1Like = {
  prepare: (sql: string) => D1Statement;
};

export type DbEnv = { MARKET_DB?: D1Like };

export function marketDb(env: unknown): D1Like | null {
  const db = (env as DbEnv | null)?.MARKET_DB;
  return db && typeof db.prepare === 'function' ? db : null;
}

export type DbRead<T> = { ok: true; rows: T[] } | { ok: false; reason: string };

/** A failed query is reported as a failure. It is never flattened to an empty list. */
export async function readRows<T>(env: unknown, sql: string, ...binds: unknown[]): Promise<DbRead<T>> {
  const db = marketDb(env);
  if (!db) return { ok: false, reason: 'The market database is not bound on this deployment.' };
  try {
    const statement = db.prepare(sql);
    const result = await (binds.length > 0 ? statement.bind(...binds) : statement).all<T>();
    return { ok: true, rows: result.results ?? [] };
  } catch {
    return { ok: false, reason: 'The market database could not be read.' };
  }
}

export type DbWrite =
  | { ok: true; written: number }
  | { ok: false; reason: string };

export async function writeRow(env: unknown, sql: string, ...binds: unknown[]): Promise<DbWrite> {
  const db = marketDb(env);
  if (!db) return { ok: false, reason: 'The market database is not bound on this deployment.' };
  try {
    const statement = db.prepare(sql);
    await (binds.length > 0 ? statement.bind(...binds) : statement).run();
    return { ok: true, written: 1 };
  } catch {
    return { ok: false, reason: 'The market database refused the write.' };
  }
}

export type RegistryRow = {
  id: string;
  area: string;
  title: string;
  status: string;
  competitor: string | null;
  notes: string | null;
};

export function registryId(row: { id: string }): string {
  return row.id;
}

/**
 * Put the catalog in D1 so the night run can read one table instead of parsing a TypeScript file.
 *
 * An upsert, not a delete-and-insert: a row's notes survive a reseed, and no row is ever removed here. A feature
 * that leaves the catalog is left in the table with its old note so the history is intact.
 */
export async function seedRegistry(env: unknown, rows: { id: string; area: string; title: string; status: string; competitor: string; reason: string }[]): Promise<DbWrite & { seeded: number }> {
  const db = marketDb(env);
  if (!db) return { ok: false, reason: 'The market database is not bound on this deployment.', seeded: 0 };
  let seeded = 0;
  for (const row of rows) {
    const written = await writeRow(
      env,
      `INSERT INTO feature_registry (id, area, title, status, competitor, notes)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         area = excluded.area,
         title = excluded.title,
         status = excluded.status,
         competitor = excluded.competitor,
         notes = excluded.notes`,
      row.id,
      row.area,
      row.title,
      row.status,
      row.competitor,
      row.reason,
    );
    if (!written.ok) return { ...written, seeded };
    seeded += 1;
  }
  return { ok: true, written: seeded, seeded };
}

export type FunnelStep = 'view' | 'quote' | 'checkout' | 'paid';

const STEPS: FunnelStep[] = ['view', 'quote', 'checkout', 'paid'];
const HOUSES = ['ranch', 'lindon', 'river'];
/** A random visit id. Never an address, a name, or a phone number. */
const VISIT = /^[A-Za-z0-9_-]{8,64}$/;
/** A day's ceiling. Reaching it stops new rows instead of filling the table. */
export const DAILY_FUNNEL_CAP = 20000;

export type FunnelInput = { step: string; house: string; visit?: string };

export function funnelIsValid(input: FunnelInput): boolean {
  if (!STEPS.includes(input.step as FunnelStep)) return false;
  if (!HOUSES.includes(input.house)) return false;
  if (input.visit !== undefined && !VISIT.test(input.visit)) return false;
  return true;
}

/**
 * Record one funnel step. No third-party tracker is involved, and nothing identifies a person.
 * Returns `stored: false` with a reason when the day is full or the database is unreachable.
 */
export async function recordFunnel(
  env: unknown,
  input: FunnelInput,
  now: Date = new Date(),
): Promise<{ stored: boolean; reason: string }> {
  if (!funnelIsValid(input)) return { stored: false, reason: 'That is not a step this page records.' };
  const day = now.toISOString().slice(0, 10);
  const counted = await readRows<{ n: number }>(
    env,
    'SELECT COUNT(*) AS n FROM funnel_events WHERE created_at >= ?',
    `${day}T00:00:00.000Z`,
  );
  if (!counted.ok) return { stored: false, reason: counted.reason };
  if ((counted.rows[0]?.n ?? 0) >= DAILY_FUNNEL_CAP) {
    return { stored: false, reason: 'The day is at its event ceiling, so this view was not recorded.' };
  }
  const written = await writeRow(
    env,
    'INSERT INTO funnel_events (step, house, visit, created_at) VALUES (?, ?, ?, ?)',
    input.step,
    input.house,
    input.visit ?? null,
    now.toISOString(),
  );
  if (!written.ok) return { stored: false, reason: written.reason };
  return { stored: true, reason: 'Recorded in the market database. No third-party tracker saw it.' };
}

export type FunnelCounts = { step: string; house: string; total: number };

export async function readFunnel(env: unknown): Promise<DbRead<FunnelCounts>> {
  return readRows<FunnelCounts>(
    env,
    `SELECT step, house, COUNT(*) AS total FROM funnel_events GROUP BY step, house ORDER BY step, house`,
  );
}

/** Whether the tables this module needs are actually there, without assuming they are. */
export async function dbTables(env: unknown): Promise<DbRead<{ name: string }>> {
  return readRows<{ name: string }>(
    env,
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name",
  );
}
