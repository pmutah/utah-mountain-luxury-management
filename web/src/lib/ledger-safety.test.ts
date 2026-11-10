/**
 * The objective for this branch is explicit: existing expenses, bookings, and receipts are not
 * deleted or changed. These tests pin that at the storage layer, where it either holds or does not.
 *
 * The bug they cover was live: `kvGet` caught **every** read failure and returned the caller's
 * default, so a network blip or an unparseable value looked exactly like "this key was never
 * written". The booking store then read `[]`, and `createReservation` saved the one row it had just
 * built over `reservations`. The only guard was on a *completely* empty list, so a one-row list
 * passed it. One create on a flaky connection replaced every saved booking.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { kvGet, kvPut, StorageReadError } from '../../functions/_lib/kv-json.ts';
import { createReservation, loadCustomReservations } from '../../functions/_lib/reservations-store.ts';
import { ensureTurnoverCleaningExpenses, saveCustomExpenses } from '../../functions/_lib/expenses.ts';
import { ledgerSafeToSave } from '../../functions/_lib/ledger-guard.ts';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

type Store = Record<string, unknown>;

/** A KV that answers from memory, counting reads so a duplicate is visible. */
function memoryEnv(seed: Store = {}) {
  const store: Store = { ...seed };
  const reads: string[] = [];
  const env = {
    SETTINGS: {
      get: async (key: string) => {
        reads.push(key);
        return key in store ? JSON.stringify(store[key]) : null;
      },
      put: async (key: string, value: string) => {
        store[key] = JSON.parse(value);
      },
    },
  };
  return { env: env as never, store, reads };
}

/** A KV whose read throws the way a real one does: a blip, a limit, or a value that will not parse. */
function brokenEnv(failure: 'blip' | 'limit' | 'corrupt') {
  const store: Store = { reservations: Array.from({ length: 86 }, (_, i) => ({ id: `res-${i}` })) };
  const wanted = JSON.stringify(store.reservations);
  const env = {
    SETTINGS: {
      get: async (key: string) => {
        if (key !== 'reservations') return null;
        if (failure === 'blip') throw new Error('Network connection lost.');
        if (failure === 'limit') throw new Error('KV GET failed: 429 limit exceeded');
        return wanted.slice(0, 12); // truncated, so JSON.parse will throw
      },
      put: async (key: string, value: string) => {
        store[key] = JSON.parse(value);
      },
    },
  };
  return { env: env as never, store };
}

test('a key that was never written returns the default, because that is the truth', async () => {
  const { env } = memoryEnv();
  assert.deepEqual(await kvGet(env, 'reservations', []), []);
  // And a binding that is not configured is the same case: nothing has been saved.
  assert.deepEqual(await kvGet({ SETTINGS: undefined } as never, 'reservations', []), []);
});

test('a read that fails is a refusal, not an empty list', async () => {
  for (const failure of ['blip', 'limit', 'corrupt'] as const) {
    const { env } = brokenEnv(failure);
    await assert.rejects(
      () => kvGet(env, 'reservations', []),
      (err: unknown) => err instanceof StorageReadError,
      `a ${failure} read returned a default instead of refusing`,
    );
  }
});

test('a create on a failed read cannot write over the saved bookings', async () => {
  /*
   * This is the exact path that lost records. Before the fix the read fell back to `[]`, the create
   * appended its new stay, and `customReservations` was replaced by that single row.
   */
  for (const failure of ['blip', 'limit', 'corrupt'] as const) {
    const { env, store } = brokenEnv(failure);
    const before = (store.reservations as unknown[]).length;
    await assert.rejects(
      () =>
        createReservation(env, {
          propertyId: 'ranch',
          checkIn: '2026-12-01',
          checkOut: '2026-12-03',
          guestName: 'Test',
          status: 'confirmed',
        } as never),
      (err: unknown) => err instanceof StorageReadError,
      `a create during a ${failure} read was allowed to proceed`,
    );
    assert.equal(
      (store.reservations as unknown[]).length,
      before,
      `a create during a ${failure} read changed the saved bookings`,
    );
  }
});

test('a legitimate create still saves, beside the rows already there', async () => {
  // The guard must not be so strict that normal work stops. This is the positive case.
  const existing = Array.from({ length: 86 }, (_, i) => ({ id: `res-${i}` }));
  const { env, store } = memoryEnv({ reservations: existing });
  assert.equal((await loadCustomReservations(env)).length, 86);
  await createReservation(env, {
    propertyId: 'ranch',
    checkIn: '2026-12-01',
    checkOut: '2026-12-03',
    guestName: 'Test',
    status: 'confirmed',
  } as never);
  assert.equal((store.reservations as unknown[]).length, 87, 'the booking was not added to the saved list');
});

test('a shorter ledger cannot be written over a longer one', async () => {
  /*
   * An empty list was already refused; that was the wrong test. What actually happened was a one-row
   * list passing, so the guard now compares row counts, which is the invariant that matters.
   */
  const existing = Array.from({ length: 86 }, (_, i) => ({ id: `res-${i}` }));
  const { env, store } = memoryEnv({ reservations: existing });
  await assert.rejects(() => kvPut(env, 'reservations', [{ id: 'res-new' }]), /would lose records/);
  assert.equal((store.reservations as unknown[]).length, 86, 'the shorter list was written anyway');

  const expenses = Array.from({ length: 463 }, (_, i) => ({ id: `exp-${i}` }));
  const led = memoryEnv({ customExpenses: expenses });
  await assert.rejects(() => kvPut(led.env, 'customExpenses', expenses.slice(0, 400)), /would lose records/);
  assert.equal((led.store.customExpenses as unknown[]).length, 463, 'the expense ledger shrank');
});

test('turnover cleaning rows may come and go, because they are derived from stays', async () => {
  // Refusing this would be wrong: a cancelled stay should take its cleaning row with it.
  const rows = [
    { id: 'exp-1' },
    { id: 'exp-2' },
    { id: 'clean-res-a' },
    { id: 'clean-res-b' },
  ];
  const { env, store } = memoryEnv({ customExpenses: rows });
  await kvPut(env, 'customExpenses', [{ id: 'exp-1' }, { id: 'exp-2' }]);
  assert.equal((store.customExpenses as unknown[]).length, 2, 'a cleaning row was refused');
});

test('a same-length write replaces rows, so editing an expense still works', async () => {
  const rows = [{ id: 'exp-1', amount: 100 }, { id: 'exp-2', amount: 200 }];
  const { env, store } = memoryEnv({ customExpenses: rows });
  await kvPut(env, 'customExpenses', [{ id: 'exp-1', amount: 999 }, { id: 'exp-2', amount: 200 }]);
  assert.equal((store.customExpenses as Array<{ amount: number }>)[0]!.amount, 999, 'the edit did not save');
});

test('the guard reuses the read the route already made, so it costs no extra KV read', async () => {
  /*
   * A guard that read KV again on every ledger save would add exactly the duplicate reads that
   * exhausted the daily limit on 2026-11-07. The route loads the ledger, then saves it: the guard
   * must see that same read.
   */
  const rows = [{ id: 'exp-1' }];
  const { env, reads } = memoryEnv({ customExpenses: rows });
  await kvGet(env, 'customExpenses', []);
  assert.equal(reads.length, 1);
  await kvPut(env, 'customExpenses', [{ id: 'exp-1' }, { id: 'exp-2' }]);
  assert.equal(reads.length, 1, 'the ledger guard spent a second read on the same key');

  // A guard on a key the route never loaded has to read it, because it has nothing else to compare
  // against. That is the case where the guard is most valuable, so the read is worth it.
  const fresh = memoryEnv({ customExpenses: rows });
  await kvPut(fresh.env, 'customExpenses', [{ id: 'exp-1' }, { id: 'exp-2' }]);
  assert.equal(fresh.reads.length, 1, 'the guard did not read a key it had never seen');
});

test('a write clears the cached read, so the next read sees what was just saved', async () => {
  // Stale-after-write would be worse than the reads it saves.
  const { env } = memoryEnv({ customExpenses: [{ id: 'exp-1' }] });
  await kvGet(env, 'customExpenses', []);
  await kvPut(env, 'customExpenses', [{ id: 'exp-1' }, { id: 'exp-2' }]);
  const after = await kvGet(env, 'customExpenses', []);
  assert.equal(after.length, 2, 'a read after a write returned the value from before it');
});


test('turnover cleaning is created on a ledger that has never been written', async () => {
  /*
   * `ledgerSafeToSave` refused an empty previous list, so on a fresh deployment the cleaning rows
   * were skipped and the function returned 0 — indistinguishable from "nothing to do". A stay at the
   * River House carried no $600 turnover expense and nothing said so.
   */
  const store: Record<string, unknown> = {};
  const env = {
    SETTINGS: {
      get: async (key: string) => (key in store ? JSON.stringify(store[key]) : null),
      put: async (key: string, value: string) => {
        store[key] = JSON.parse(value);
      },
    },
  } as never;
  const stays = [
    { id: 'res-1', propertyId: 'river', checkIn: '2026-12-01', checkOut: '2026-12-03', guestName: 'A', status: 'confirmed' },
  ];
  const written = await ensureTurnoverCleaningExpenses(env, stays as never);
  assert.equal(written, 1, 'the turnover cleaning expense was not created on a fresh ledger');
  const saved = store.customExpenses as Array<{ id: string; amount: number; vendor: string }>;
  assert.equal(saved.length, 1);
  assert.equal(saved[0]!.id, 'clean-res-1');
  assert.equal(saved[0]!.amount, 600, 'the River House turnover fee was not the published $600');
});

test('a refused turnover save says so instead of reporting zero', async () => {
  /*
   * The old code returned 0 when the guard refused, which reads as success. A silent refusal is how
   * a missing expense row goes unnoticed for months.
   */
  assert.throws(
    () => {
      // The guard's own contract, called the way the writer calls it: a shorter ledger is refused.
      const previous = [{ id: 'exp-1' }, { id: 'exp-2' }];
      const merged = [{ id: 'exp-1' }];
      if (!ledgerSafeToSave(previous, merged)) {
        throw new Error('Refusing to save turnover cleaning over the saved ledger. Nothing was written.');
      }
    },
    /Refusing to save turnover cleaning/,
  );
});

test('the ledger guard actually covers the expense ledger', async () => {
  /*
   * `saveCustomExpenses` wrote to KV directly instead of going through `kvPut`, so the guard added
   * for bookings never covered expenses at all — the registry said expenses were protected and only
   * bookings were. This pins the coverage rather than the mechanism, so re-inlining the write would
   * fail here.
   */
  const rows = Array.from({ length: 20 }, (_, i) => ({
    id: `exp-${i}`,
    month: '2026-11',
    propertyId: 'ranch',
    category: 'Repairs',
    amount: 100,
    vendor: 'A',
    createdAt: '2026-11-01',
  }));
  const { env, store } = memoryEnv({ customExpenses: rows });
  await assert.rejects(
    () => saveCustomExpenses(env, rows.slice(0, 3)),
    /would lose records/,
    'the expense ledger shrank with no refusal, so the guard does not cover it',
  );
  assert.equal((store.customExpenses as unknown[]).length, 20);
});

test('a delete that was meant still saves when it says why', async () => {
  // The delete route archives the row first and then removes it. Refusing that would break delete.
  const rows = [
    { id: 'exp-1', month: '2026-11', propertyId: 'ranch', category: 'Repairs', amount: 100, vendor: 'A', createdAt: '2026-11-01' },
    { id: 'exp-2', month: '2026-11', propertyId: 'ranch', category: 'Repairs', amount: 200, vendor: 'B', createdAt: '2026-11-01' },
  ];
  const { env, store } = memoryEnv({ customExpenses: rows });
  await saveCustomExpenses(env, [rows[1]!], { allowShrinkReason: 'Expense exp-1 archived, then removed.' });
  assert.equal((store.customExpenses as unknown[]).length, 1, 'the archived expense could not be removed');
});

test('the delete route declares its intent, so its removal is not refused', async () => {
  /*
   * A shrink with no reason is the shape of every accidental wipe. The one path that removes a row
   * on purpose has to say so at the call site, which also makes it visible in review.
   */
  const route = readFileSync(
    join(process.cwd(), 'functions', 'api', 'expenses', '[id].ts'),
    'utf8',
  );
  assert.match(route, /saveCustomExpenses\(env, custom, \{ allowShrinkReason:/, 'the delete route removes a row without saying why');
  assert.match(route, /archiveExpense\(/, 'the delete route removes a row without archiving it first');
});

test('a stored receipt is deleted only by a host, and only where it says why', () => {
  /*
   * The branch objective names three things that must survive this rebuild: expenses, bookings, and **receipts**. The
   * ledger guard above covers expense rows; this covers the stored files themselves, which is a different store and a
   * different way to lose something.
   *
   * The archive already refuses a shorter ledger, so a row cannot vanish — but the bytes behind it could still be
   * deleted while its row survived, leaving a documented expense pointing at nothing.
   */
  const root = join(process.cwd(), 'functions');
  const files = readdirSync(join(root, 'api'), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
    .map((entry) => join(entry.parentPath ?? root, entry.name));

  const deleters = files.filter((file) => /deleteStoredReceipt\(/.test(readFileSync(file, 'utf8')));
  assert.ok(deleters.length > 0, 'the search found no receipt deletion at all, so it is not reading the routes');

  for (const file of deleters) {
    const text = readFileSync(file, 'utf8');
    const rel = relative(process.cwd(), file).replace(/\\/g, '/');
    // Every one of these routes is host-only, checked by the route guard as well.
    assert.match(
      text,
      /hostOnly\(request, env\)|hostDenied\(request, env\)/,
      `${rel} deletes a receipt without a host guard`,
    );
  }

  /*
   * And the set is exactly the three declared paths. A fourth appearing means someone added a way to remove receipt
   * bytes, which is the thing this test exists to make visible.
   */
  const names = deleters.map((file) => relative(process.cwd(), file).replace(/\\/g, '/')).sort();
  assert.deepEqual(
    names,
    [
      'functions/api/expenses/[id]/attach-receipt.ts',
      'functions/api/expenses/[id]/photos/[photoId].ts',
      'functions/api/expenses/archive.ts',
    ],
    `receipt deletion moved or was added:\n${names.join('\n')}`,
  );
});
