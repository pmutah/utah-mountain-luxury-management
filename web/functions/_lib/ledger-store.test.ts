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
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { migrateKvLedger } from './ledger-migrate.ts';
import { one } from './ledger-db.ts';
import { onRequestPost as onMigratePost } from '../api/ledger/migrate.ts';
import { deleteReservation, getAllReservations, updateReservation } from './reservations-store.ts';
import { loadCustomExpenses, updateExpenseRow } from './expenses.ts';
import { onRequestPatch } from '../api/reservations/[id].ts';
import { onRequestGet as onReservationsGet } from '../api/reservations/index.ts';
import { onRequestGet as onExpensesGet } from '../api/expenses/index.ts';
import type { SettingsEnv } from './kv.ts';
import type { LedgerDb, D1Statement } from './ledger-db.ts';

const LEDGER_DIR = join(process.cwd(), 'migrations/ledger');
const SCHEMA = readdirSync(LEDGER_DIR)
  .filter((name) => name.endsWith('.sql'))
  .sort()
  .map((name) => readFileSync(join(LEDGER_DIR, name), 'utf8'))
  .join('\n');
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

test('a missing house resolves from another field or the seed, and a row that cannot is kept', async () => {
  const bad = {
    id: 'res-bad',
    guestName: 'No House',
    listingId: 'not-a-house',
    checkIn: '2027-05-01',
    checkOut: '2027-05-04',
    payout: 10,
    source: 'Direct',
  };
  const { env, puts, data } = openDb({
    reservations: JSON.stringify([
      stay('res-ok', 100, '2027-03-01', '2027-03-04'),
      {
        id: 'res-prop',
        guestName: 'Ada',
        property: 'river',
        checkIn: '2027-04-01',
        checkOut: '2027-04-04',
        payout: 50,
        source: 'Direct',
      },
      {
        id: 'res-named',
        guestName: 'Bea',
        propertyName: 'The Lindon House',
        checkIn: '2027-04-10',
        checkOut: '2027-04-12',
        payout: 40,
        source: 'Airbnb',
      },
      {
        id: 'r-shelly',
        guestName: 'Shelly Terry',
        checkIn: '2026-10-08',
        checkOut: '2026-10-11',
        payout: 1939.27,
        source: 'Airbnb',
      },
      {
        id: 'res-ical',
        guestName: 'Cal',
        propertyId: 'ranch',
        start: '2027-10-01',
        end: '2027-10-04',
        payout: 1,
        source: 'Calendar',
      },
      {
        id: 'res-nodate',
        guestName: 'No Date',
        propertyId: 'ranch',
        payout: 3,
        source: 'Direct',
      },
      bad,
    ]),
    reservationOverrides: JSON.stringify({
      r1: { note: 'left a note', source: 'Airbnb' },
      'only-ov': { guestName: 'Pat Only', checkIn: '2027-06-01', checkOut: '2027-06-04' },
    }),
    customExpenses: '[]',
  });

  const imported = await migrateKvLedger(env);
  assert.equal(imported.kvWrites, false);
  assert.equal(imported.dryRun, false);
  assert.equal(imported.reservationsInserted, 5);
  assert.equal(imported.overridesInserted, 2);
  assert.deepEqual(puts.filter((key) => key === 'reservations' || key === 'reservationOverrides'), []);

  const byId = async (id: string) =>
    one<{ property_id: string; check_in: string; check_out: string }>(
      env,
      'SELECT property_id, check_in, check_out FROM reservations WHERE id = ?',
      id,
    );
  assert.equal((await byId('res-prop'))?.property_id, 'river');
  assert.equal((await byId('res-named'))?.property_id, 'lindon');
  assert.equal((await byId('r-shelly'))?.property_id, 'ranch');
  assert.equal((await byId('res-ical'))?.check_in, '2027-10-01');
  assert.equal((await byId('res-ical'))?.check_out, '2027-10-04');
  assert.equal(await byId('res-bad'), null);
  assert.equal(await byId('res-nodate'), null);
  assert.equal(await byId('only-ov'), null);

  const shown = await getAllReservations(env);
  assert.equal(shown.find((row) => row.id === 'res-prop')?.propertyId, 'river');
  assert.equal(shown.find((row) => row.id === 'res-bad'), undefined);

  const badReport = imported.unresolved.find((row) => row.id === 'res-bad');
  assert.equal(badReport?.sourceKey, 'reservations');
  assert.equal(badReport?.guest, 'No House');
  assert.equal(badReport?.dates, '2027-05-01 to 2027-05-04');
  assert.deepEqual(badReport?.missing, ['property_id']);
  assert.equal(badReport?.rawFields.listingId, 'not-a-house');
  assert.equal(badReport?.rawFields.propertyId, null);
  assert.equal(badReport?.rawFields.property, null);
  assert.equal(badReport?.rawFields.propertyName, null);

  const nodate = imported.unresolved.find((row) => row.id === 'res-nodate');
  assert.ok(nodate?.missing.includes('check_in') && nodate.missing.includes('check_out'));

  const orphan = imported.unresolved.find((row) => row.id === 'only-ov');
  assert.equal(orphan?.sourceKey, 'reservationOverrides');
  assert.equal(orphan?.guest, 'Pat Only');
  assert.deepEqual(orphan?.missing, ['property_id']);
  assert.equal(imported.unresolved.some((row) => row.id === 'r1'), false);

  const storedOverride = await one<{ body: string }>(
    env,
    'SELECT body FROM reservation_overrides WHERE id = ?',
    'only-ov',
  );
  assert.equal(JSON.parse(storedOverride?.body ?? '{}').guestName, 'Pat Only');
  const kept = await one<{ body: string }>(env, 'SELECT body FROM ledger_unresolved WHERE source_key = ? AND id = ?', 'reservations', 'res-bad');
  assert.equal(JSON.parse(kept?.body ?? '{}').listingId, 'not-a-house');

  const again = await migrateKvLedger({
    LEDGER_DB: env.LEDGER_DB,
    SETTINGS: env.SETTINGS,
    DASHBOARD_PASSWORD: PASSWORD,
  } as typeof env);
  assert.equal(again.alreadyMigrated, true);
  assert.equal(again.reservationsInserted, 0);
  assert.equal(again.unresolved.filter((row) => row.id === 'res-bad').length, 1);
  const stillOne = await one<{ n: number }>(
    env,
    "SELECT COUNT(*) AS n FROM ledger_unresolved WHERE source_key = 'reservations' AND id = 'res-bad'",
  );
  assert.equal(Number(stillOne?.n), 1);

  const fixed = { ...bad, propertyId: 'ranch' };
  data.set(
    'reservations',
    JSON.stringify([
      stay('res-ok', 100, '2027-03-01', '2027-03-04'),
      fixed,
    ]),
  );
  const third = await migrateKvLedger({
    LEDGER_DB: env.LEDGER_DB,
    SETTINGS: env.SETTINGS,
    DASHBOARD_PASSWORD: PASSWORD,
  } as typeof env);
  assert.equal(third.reservationsInserted, 1);
  assert.equal(third.unresolved.some((row) => row.id === 'res-bad'), false);
  assert.equal((await byId('res-bad'))?.property_id, 'ranch');
  const cleared = await one<{ n: number }>(
    env,
    "SELECT COUNT(*) AS n FROM ledger_unresolved WHERE source_key = 'reservations' AND id = 'res-bad'",
  );
  assert.equal(Number(cleared?.n), 0);
});

test('an expense missing a required column is reported and the others are saved', async () => {
  const { env, puts } = openDb({
    reservations: JSON.stringify([
      {
        id: 'res-now',
        guestName: 'No Stamp',
        propertyId: 'river',
        checkIn: '2027-07-01',
        checkOut: '2027-07-03',
        payout: 1,
        source: 'Direct',
      },
    ]),
    customExpenses: JSON.stringify([
      { id: 'exp-ok', month: '2026-11', propertyId: 'ranch', category: 'Repair', amount: 40 },
      { id: 'exp-named', propertyName: 'The Ranch House', month: '2026-8', category: 'Supplies', amount: '12.5' },
      { id: 'exp-house', property: 'household', month: '2026-10', category: 'Furnishings', amount: 9 },
      { id: 'exp-zero', month: '2026-11', propertyId: 'ranch', category: 'Other', amount: 0 },
      { id: 'exp-rmp', propertyId: 'ranch', month: '2026-09', amount: 30, vendor: 'Rocky Mountain Power' },
      { id: 'exp-note', propertyId: 'lindon', category: 'Utilities', amount: 20, note: 'Paid 2026-08-05' },
      { id: 'exp-gap', vendor: 'Mystery Shop', note: 'no month or amount' },
    ]),
  });

  const imported = await migrateKvLedger(env);
  assert.equal(imported.expensesInserted, 6);
  assert.equal(imported.reservationsInserted, 1);
  assert.deepEqual(puts.filter((key) => key === 'customExpenses'), []);

  const gap = imported.unresolved.find((row) => row.id === 'exp-gap');
  assert.equal(gap?.sourceKey, 'customExpenses');
  assert.equal(gap?.guest, 'Mystery Shop');
  assert.ok(gap?.missing.includes('property_id'));
  assert.ok(gap?.missing.includes('month'));
  assert.ok(gap?.missing.includes('category'));
  assert.ok(gap?.missing.includes('amount'));
  assert.equal(await one(env, 'SELECT id FROM expenses WHERE id = ?', 'exp-gap'), null);

  const rows = await loadCustomExpenses(env);
  assert.equal(rows.find((row) => row.id === 'exp-named')?.propertyId, 'ranch');
  assert.equal(rows.find((row) => row.id === 'exp-named')?.month, '2026-08');
  assert.equal(rows.find((row) => row.id === 'exp-named')?.amount, 12.5);
  assert.equal(rows.find((row) => row.id === 'exp-house')?.propertyId, 'household');
  assert.equal(rows.find((row) => row.id === 'exp-zero')?.amount, 0);
  assert.equal(rows.find((row) => row.id === 'exp-rmp')?.category, 'Utilities');
  assert.equal(rows.find((row) => row.id === 'exp-note')?.month, '2026-08');
  assert.equal(rows.find((row) => row.id === 'exp-ok')?.amount, 40);

  const stamp = await one<{ updated_at: string }>(env, 'SELECT updated_at FROM reservations WHERE id = ?', 'res-now');
  assert.match(stamp?.updated_at ?? '', /^\d{4}-\d{2}-\d{2}T/);
});

test('dryRun=1 returns counts and unresolved rows and writes nothing', async () => {
  const seed = {
    reservations: JSON.stringify([
      stay('res-ok', 80, '2027-03-01', '2027-03-04'),
      { id: 'res-bad', guestName: 'No House', checkIn: '2027-05-01', checkOut: '2027-05-03', payout: 1, source: 'Direct' },
    ]),
    reservationOverrides: JSON.stringify({
      'only-ov': { guestName: 'Pat Only', checkIn: '2027-06-01', checkOut: '2027-06-04' },
    }),
    customExpenses: JSON.stringify([
      { id: 'exp-ok', month: '2026-11', propertyId: 'ranch', category: 'Repair', amount: 40 },
      { id: 'exp-gap', note: 'nothing else' },
    ]),
  };
  const { env, puts, db } = openDb(seed);
  const preview = await onMigratePost({
    request: new Request('https://x/api/ledger/migrate?dryRun=1', {
      method: 'POST',
      headers: { Cookie: COOKIE },
    }),
    env,
  } as unknown as Parameters<typeof onMigratePost>[0]);
  assert.equal(preview.status, 200, await preview.clone().text());
  const body = (await preview.json()) as {
    dryRun?: boolean;
    kvWrites?: boolean;
    reservationsInserted?: number;
    overridesInserted?: number;
    expensesInserted?: number;
    unresolved?: Array<{ id: string }>;
  };
  assert.equal(body.dryRun, true);
  assert.equal(body.kvWrites, false);
  assert.equal(body.reservationsInserted, 1);
  assert.equal(body.overridesInserted, 1);
  assert.equal(body.expensesInserted, 1);
  assert.deepEqual(
    body.unresolved?.map((row) => row.id).sort(),
    ['exp-gap', 'only-ov', 'res-bad'],
  );
  assert.equal(Number((db.prepare('SELECT COUNT(*) AS n FROM reservations').get() as { n: number }).n), 0);
  assert.equal(Number((db.prepare('SELECT COUNT(*) AS n FROM expenses').get() as { n: number }).n), 0);
  assert.equal(Number((db.prepare('SELECT COUNT(*) AS n FROM ledger_unresolved').get() as { n: number }).n), 0);
  assert.equal(db.prepare('SELECT value FROM ledger_meta WHERE key = ?').get('kv_imported_at'), undefined);
  assert.deepEqual(puts, []);

  const written = await migrateKvLedger(env);
  assert.equal(written.dryRun, false);
  assert.equal(written.reservationsInserted, 1);
  assert.equal(written.expensesInserted, 1);
  assert.equal(Number((db.prepare('SELECT COUNT(*) AS n FROM reservations').get() as { n: number }).n), 1);
  assert.equal(puts.filter((key) => key === 'reservations' || key === 'customExpenses').length, 0);
});
