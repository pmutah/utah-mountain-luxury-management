/**
 * Row storage for bookings and expenses.
 *
 * Run from web/: npx tsx --test functions/_lib/ledger-store.test.ts
 *
 * The database is the same SQL as web/migrations/ledger/0001_ledger.sql, on Node's SQLite,
 * behind the D1 prepare/bind/run shape the Pages binding uses. Two overlapping PATCHes share
 * that one database, which is the race KV could not settle.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { migrateKvLedger } from './ledger-migrate.ts';
import { deleteReservation, getAllReservations, updateReservation } from './reservations-store.ts';
import { loadCustomExpenses, updateExpenseRow } from './expenses.ts';
import { onRequestPatch } from '../api/reservations/[id].ts';
import { onRequestGet as onReservationsGet } from '../api/reservations/index.ts';
import { onRequestGet as onExpensesGet } from '../api/expenses/index.ts';
import type { SettingsEnv } from './kv.ts';
import type { LedgerDb, D1Statement } from './ledger-db.ts';

const SCHEMA = readFileSync(join(process.cwd(), 'migrations/ledger/0001_ledger.sql'), 'utf8');
const PASSWORD = 'test-password';
const COOKIE = `wpm_auth=${btoa(`wpm:${PASSWORD}`).replace(/=+$/, '')}`;

function sqliteD1(db: DatabaseSync): LedgerDb {
  return {
    prepare(sql: string) {
      const stmt = db.prepare(sql);
      let bound: unknown[] = [];
      const api: D1Statement = {
        bind(...values: unknown[]) {
          bound = values.map((value) => (value === undefined ? null : value));
          return api;
        },
        async all<T = Record<string, unknown>>() {
          const results = stmt.all(...(bound as never[])) as T[];
          return { results };
        },
        async run() {
          const info = stmt.run(...(bound as never[]));
          return { meta: { changes: Number(info.changes ?? 0) } };
        },
      };
      return api;
    },
    async batch(statements) {
      db.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        db.exec('COMMIT');
        return results;
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },
    async exec(sql: string) {
      db.exec(sql);
    },
  };
}

function memoryKv(seed: Record<string, string> = {}) {
  const data = new Map(Object.entries(seed));
  const puts: string[] = [];
  return {
    puts,
    data,
    kv: {
      async get(key: string) {
        return data.get(key) ?? null;
      },
      async put(key: string, value: string) {
        puts.push(key);
        data.set(key, value);
      },
      async delete(key: string) {
        data.delete(key);
      },
    },
  };
}

function openDb(seed?: Record<string, string>) {
  const db = new DatabaseSync(':memory:');
  db.exec(SCHEMA);
  const store = memoryKv(seed);
  const env = {
    LEDGER_DB: sqliteD1(db),
    SETTINGS: store.kv,
    DASHBOARD_PASSWORD: PASSWORD,
  } as SettingsEnv & { DASHBOARD_PASSWORD: string };
  return { db, env, puts: store.puts, data: store.data };
}

function stay(id: string, payout: number, checkIn: string, checkOut: string) {
  return {
    id,
    guestName: `Guest ${id}`,
    propertyId: 'river' as const,
    checkIn,
    checkOut,
    payout,
    source: 'Airbnb',
    status: 'confirmed' as const,
    createdAt: '2026-11-22T00:00:00.000Z',
  };
}

test('import is idempotent, unions a later KV read, and does not write the blobs', async () => {
  const first = stay('res-a', 100, '2027-03-01', '2027-03-04');
  const second = stay('res-b', 200, '2027-04-01', '2027-04-04');
  const { env, puts, data } = openDb({
    reservations: JSON.stringify([first]),
    reservationOverrides: JSON.stringify({ r1: { status: 'cancelled', source: 'Airbnb' } }),
    customExpenses: JSON.stringify([
      { id: 'exp-1', month: '2026-11', propertyId: 'ranch', category: 'Repair', amount: 40 },
    ]),
  });

  const imported = await migrateKvLedger(env);
  assert.equal(imported.reservationsInserted, 1);
  assert.equal(imported.overridesInserted, 1);
  assert.equal(imported.expensesInserted, 1);
  assert.equal(imported.kvWrites, false);
  assert.deepEqual(puts.filter((key) => key === 'reservations' || key === 'customExpenses'), []);

  data.set('reservations', JSON.stringify([first, second]));
  // A second POST is a new request. The per-request read cache must not hide the other KV copy.
  const again = await migrateKvLedger({
    LEDGER_DB: env.LEDGER_DB,
    SETTINGS: env.SETTINGS,
    DASHBOARD_PASSWORD: PASSWORD,
  } as typeof env);
  assert.equal(again.alreadyMigrated, true);
  assert.equal(again.reservationsInserted, 1, 'the row missing from the first KV read was not added');

  const third = await migrateKvLedger(env);
  assert.equal(third.reservationsInserted, 0);

  const list = await getAllReservations(env);
  assert.equal(list.find((row) => row.id === 'res-a')?.payout, 100);
  assert.equal(list.find((row) => row.id === 'res-b')?.payout, 200);
  assert.equal(list.find((row) => row.id === 'r1'), undefined, 'a seed stay cancelled in overrides came back');

  await deleteReservation(env, 'res-b');
  data.set('reservations', JSON.stringify([first, second]));
  const afterDelete = await migrateKvLedger({
    LEDGER_DB: env.LEDGER_DB,
    SETTINGS: env.SETTINGS,
    DASHBOARD_PASSWORD: PASSWORD,
  } as typeof env);
  assert.equal(afterDelete.reservationsInserted, 0, 'a deleted stay was imported again');
  assert.equal((await getAllReservations(env)).find((row) => row.id === 'res-b'), undefined);
});

test('two PATCHes on different rows both persist', async () => {
  const { env, puts } = openDb({
    reservations: JSON.stringify([
      stay('res-a', 100, '2027-03-01', '2027-03-04'),
      stay('res-b', 200, '2027-04-01', '2027-04-04'),
    ]),
    reservationOverrides: '{}',
    customExpenses: '[]',
  });
  await migrateKvLedger(env);
  puts.length = 0;

  const { onRequestPatch: patch } = { onRequestPatch };
  const [left, right] = await Promise.all([
    patch({
      request: new Request('https://x/api/reservations/res-a', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: COOKIE, 'If-Match': '"1"' },
        body: JSON.stringify({ note: 'from A' }),
      }),
      env,
      params: { id: 'res-a' },
    } as unknown as Parameters<typeof patch>[0]),
    patch({
      request: new Request('https://x/api/reservations/res-b', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: COOKIE, 'If-Match': '"1"' },
        body: JSON.stringify({ note: 'from B' }),
      }),
      env,
      params: { id: 'res-b' },
    } as unknown as Parameters<typeof patch>[0]),
  ]);
  assert.equal(left.status, 200, await left.clone().text());
  assert.equal(right.status, 200, await right.clone().text());
  const list = await getAllReservations(env);
  assert.equal(list.find((row) => row.id === 'res-a')?.note, 'from A');
  assert.equal(list.find((row) => row.id === 'res-b')?.note, 'from B');
  assert.equal(list.find((row) => row.id === 'res-a')?.payout, 100);
  assert.equal(list.find((row) => row.id === 'res-b')?.payout, 200);
  assert.deepEqual(puts.filter((key) => key === 'reservations'), [], 'a row edit wrote the whole reservation blob');
});

test('two PATCHes on the same row with the same version: one 200 and one 409', async () => {
  const { env } = openDb({
    reservations: JSON.stringify([stay('res-a', 100, '2027-03-01', '2027-03-04')]),
    reservationOverrides: '{}',
    customExpenses: '[]',
  });
  await migrateKvLedger(env);

  const send = (note: string) =>
    onRequestPatch({
      request: new Request('https://x/api/reservations/res-a', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: COOKIE, 'If-Match': '"1"' },
        body: JSON.stringify({ note }),
      }),
      env,
      params: { id: 'res-a' },
    } as unknown as Parameters<typeof onRequestPatch>[0]);

  const [first, second] = await Promise.all([send('one'), send('two')]);
  const statuses = [first.status, second.status].sort();
  assert.deepEqual(statuses, [200, 409]);
  const conflict = first.status === 409 ? first : second;
  const body = (await conflict.json()) as { code?: string; current?: { note?: string; version?: number } };
  assert.equal(body.code, 'version_conflict');
  assert.equal(body.current?.version, 2);
  const saved = (await getAllReservations(env)).find((row) => row.id === 'res-a');
  assert.ok(saved?.note === 'one' || saved?.note === 'two');
  assert.equal(saved?.version, 2);
  assert.equal(saved?.payout, 100);

  const retry = await updateReservation(env, 'res-a', { note: 'retried' }, body.current?.version);
  assert.equal(retry?.note, 'retried');
  assert.equal(retry?.version, 3);
});

test('an expense PATCH updates that row only', async () => {
  const { env, puts } = openDb({
    reservations: '[]',
    customExpenses: JSON.stringify([
      { id: 'exp-1', month: '2026-11', propertyId: 'ranch', category: 'Repair', amount: 40 },
      { id: 'exp-2', month: '2026-11', propertyId: 'ranch', category: 'Supplies', amount: 15 },
    ]),
  });
  await migrateKvLedger(env);
  puts.length = 0;
  const saved = await updateExpenseRow(
    env,
    { id: 'exp-1', month: '2026-11', propertyId: 'ranch', category: 'Repair', amount: 55 },
    1,
  );
  assert.equal(saved.version, 2);
  assert.equal(saved.amount, 55);
  const rows = await loadCustomExpenses(env);
  assert.equal(rows.find((row) => row.id === 'exp-2')?.amount, 15);
  assert.equal(rows.find((row) => row.id === 'exp-2')?.version, 1);
  assert.deepEqual(puts.filter((key) => key === 'customExpenses'), []);
});

test('GET reservations and GET expenses do not write', async () => {
  const { env, puts } = openDb({
    reservations: JSON.stringify([stay('res-a', 80, '2027-05-01', '2027-05-03')]),
    customExpenses: JSON.stringify([
      { id: 'exp-1', month: '2026-11', propertyId: 'ranch', category: 'Repair', amount: 10, note: 'paid 2026-11-02' },
    ]),
  });
  await migrateKvLedger(env);
  puts.length = 0;
  const stays = await onReservationsGet({
    request: new Request('https://x/api/reservations', { headers: { Cookie: COOKIE } }),
    env,
    waitUntil() {},
  } as unknown as Parameters<typeof onReservationsGet>[0]);
  const bills = await onExpensesGet({
    request: new Request('https://x/api/expenses', { headers: { Cookie: COOKIE } }),
    env,
  } as unknown as Parameters<typeof onExpensesGet>[0]);
  assert.equal(stays.status, 200);
  assert.equal(bills.status, 200);
  assert.deepEqual(puts, [], `a read wrote ${puts.join(', ')}`);
});

test('a stored payout beats the seed amount after import', async () => {
  const { env } = openDb({
    reservations: JSON.stringify([
      {
        id: 'res-kim',
        guestName: 'Kim Smelcer',
        propertyId: 'lindon',
        checkIn: '2026-01-04',
        checkOut: '2026-01-17',
        payout: 927.46,
        source: 'VRBO',
        status: 'confirmed',
      },
    ]),
  });
  await migrateKvLedger(env);
  const row = (await getAllReservations(env)).find((stay) => stay.id === 'res-kim');
  assert.equal(row?.payout, 927.46);
  assert.equal(row?.source, 'VRBO');
});
