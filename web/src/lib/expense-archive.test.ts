/**
 * A deleted expense used to be gone: the row left `customExpenses` and the receipt file was removed
 * from storage, with nothing to restore. These tests pin that a delete is now reversible, that the
 * restored row is byte-for-byte the one that was removed, and that a delete which cannot be archived
 * does not happen.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { archiveCountLine } from './expense-archive-line.ts';
import { archiveExpense, archiveLine, findArchivedExpense, loadArchivedExpenses, unarchiveExpense } from '../../functions/_lib/expense-archive.ts';

type Store = Map<string, string>;
type RouteHandler = (context: { request: Request; env: unknown; params: Record<string, string> }) => Promise<Response>;

const PASSWORD = 'test-password';
const COOKIE = `wpm_auth=${btoa(`wpm:${PASSWORD}`).replace(/=+$/, '')}`;

function fakeKv(store: Store, opts: { failPut?: boolean } = {}) {
  return {
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string) {
      if (opts.failPut && key === 'expenseArchive') throw new Error('KV write failed');
      store.set(key, value);
    },
  };
}

const ROW = {
  id: 'exp-1',
  month: '2026-11',
  propertyId: 'ranch',
  category: 'Repair',
  amount: 412.5,
  note: 'Fixed the gate',
  vendor: 'Wasatch Fence',
  paidBy: 'brandon',
  paidDate: '2026-11-03',
  createdAt: '2026-11-03T10:00:00.000Z',
  receiptStoragePath: 'receipts/exp-1.pdf',
  receiptContentType: 'application/pdf',
  itemPhotos: [{ id: 'p1', storagePath: 'receipts/exp-1-p1.jpg', contentType: 'image/jpeg', uploadedAt: '2026-11-03T10:00:00.000Z' }],
};

function seeded(): Store {
  const store: Store = new Map();
  store.set('customExpenses', JSON.stringify([ROW, { ...ROW, id: 'exp-2', amount: 99 }]));
  return store;
}

function envFor(store: Store, opts: { failPut?: boolean } = {}) {
  return { SETTINGS: fakeKv(store, opts), DASHBOARD_PASSWORD: PASSWORD };
}

async function routes() {
  const archive = (await import('../../functions/api/expenses/archive.ts')) as unknown as Record<string, RouteHandler>;
  const expense = (await import('../../functions/api/expenses/[id].ts')) as unknown as Record<string, RouteHandler>;
  return { archive, expense };
}

test('an archived row is kept exactly as it was, including its receipt path', async () => {
  const store = seeded();
  const rows = await archiveExpense(envFor(store) as never, ROW, 'wrong house');
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0]!.expense, ROW, 'the archived row was not identical to the original');
  assert.equal(rows[0]!.reason, 'wrong house');
  assert.ok(rows[0]!.removedAt);

  // The archive is a separate key. The live list is untouched by archiving.
  assert.deepEqual(
    JSON.parse(store.get('customExpenses') ?? '[]').map((r: { id: string }) => r.id),
    ['exp-1', 'exp-2'],
  );
});

test('archiving the same row twice keeps one entry', async () => {
  const store = seeded();
  const env = envFor(store);
  await archiveExpense(env as never, ROW);
  const rows = await archiveExpense(env as never, ROW);
  assert.equal(rows.length, 1, 'a row removed twice stacked two entries');
});

test('a delete archives first, then removes the row', async () => {
  const store = seeded();
  const { expense } = await routes();
  const res = await expense.onRequestDelete!({
    request: new Request('https://x/api/expenses/exp-1?reason=duplicate', {
      method: 'DELETE',
      headers: { Cookie: COOKIE },
    }),
    env: envFor(store),
    params: { id: 'exp-1' },
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { archived?: boolean; restore?: string };
  assert.equal(body.archived, true, 'the delete did not report the archive');
  assert.match(body.restore ?? '', /restore=exp-1/);

  const left = JSON.parse(store.get('customExpenses') ?? '[]') as Array<{ id: string }>;
  assert.deepEqual(left.map((r) => r.id), ['exp-2'], 'the deleted row was not removed');

  const archived = await loadArchivedExpenses(envFor(store) as never);
  assert.equal(archived.length, 1);
  assert.deepEqual(archived[0]!.expense, ROW, 'the archived copy differs from what was removed');
});

test('a delete that cannot be archived does not happen at all', async () => {
  const store = seeded();
  const { expense } = await routes();
  const res = await expense.onRequestDelete!({
    request: new Request('https://x/api/expenses/exp-1', { method: 'DELETE', headers: { Cookie: COOKIE } }),
    env: envFor(store, { failPut: true }),
    params: { id: 'exp-1' },
  });
  assert.notEqual(res.status, 200, 'a delete went ahead without an archive');
  // The expense is still on the books, and the other row is untouched.
  const left = JSON.parse(store.get('customExpenses') ?? '[]') as Array<{ id: string }>;
  assert.deepEqual(left.map((r) => r.id), ['exp-1', 'exp-2']);
});

test('a restore keeps the receipt readable, so the row is not pointing at a deleted file', async () => {
  /*
   * The first cut archived the row and then deleted the receipt bytes from storage. A restore then
   * looked successful while the receipt was gone. Assert the file is still served after a delete and
   * a restore, by stubbing the storage read the receipt route uses.
   */
  const store = seeded();
  store.set('receiptBytes', 'the original receipt');
  const deleted: string[] = [];
  const storage = {
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
    /** If the delete route calls this, the receipt is gone and the restore is a lie. */
    async delete(key: string) {
      deleted.push(key);
      store.delete(key);
    },
  };
  const env = { ...envFor(store), RECEIPTS: storage };

  const { archive, expense } = await routes();
  const del = await expense.onRequestDelete!({
    request: new Request('https://x/api/expenses/exp-1', { method: 'DELETE', headers: { Cookie: COOKIE } }),
    env,
    params: { id: 'exp-1' },
  });
  assert.equal(del.status, 200);
  assert.deepEqual(deleted, [], 'the delete removed the receipt file, so a restore would point at nothing');
  assert.equal(store.get('receiptBytes'), 'the original receipt');

  const back = await archive.onRequestPost!({
    request: new Request('https://x/api/expenses/archive?restore=exp-1', { method: 'POST', headers: { Cookie: COOKIE } }),
    env,
    params: {},
  });
  assert.equal(back.status, 200);
  const restored = (JSON.parse(store.get('customExpenses') ?? '[]') as Array<Record<string, unknown>>).find(
    (r) => r.id === 'exp-1',
  );
  assert.equal(restored?.receiptStoragePath, ROW.receiptStoragePath, 'the restored row lost its receipt path');
  assert.equal(store.get('receiptBytes'), 'the original receipt', 'the receipt bytes are gone after a restore');
});

test('a purge is the only place a receipt is deleted, and only on an archived row', async () => {
  const store = seeded();
  const deleted: string[] = [];
  const storage = {
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
    async delete(key: string) {
      deleted.push(key);
    },
  };
  const env = { ...envFor(store), RECEIPTS: storage };
  const { archive, expense } = await routes();

  // A live expense cannot be purged: it has to be removed first, which archives it.
  const live = await archive.onRequestDelete!({
    request: new Request('https://x/api/expenses/archive?purge=exp-1', { method: 'DELETE', headers: { Cookie: COOKIE } }),
    env,
    params: {},
  });
  assert.equal(live.status, 404, 'a live expense was purged, bypassing the archive');
  assert.deepEqual(deleted, []);

  await expense.onRequestDelete!({
    request: new Request('https://x/api/expenses/exp-1', { method: 'DELETE', headers: { Cookie: COOKIE } }),
    env,
    params: { id: 'exp-1' },
  });
  assert.equal((await loadArchivedExpenses(envFor(store) as never)).length, 1);

  const purged = await archive.onRequestDelete!({
    request: new Request('https://x/api/expenses/archive?purge=exp-1', { method: 'DELETE', headers: { Cookie: COOKIE } }),
    env,
    params: {},
  });
  assert.equal(purged.status, 200, 'an archived row could not be purged');
  assert.equal((await loadArchivedExpenses(envFor(store) as never)).length, 0, 'the purged row stayed in the archive');
});

test('a purge needs the host', async () => {
  const store = seeded();
  await archiveExpense(envFor(store) as never, ROW);
  const { archive } = await routes();
  const res = await archive.onRequestDelete!({
    request: new Request('https://x/api/expenses/archive?purge=exp-1', { method: 'DELETE' }),
    env: envFor(store),
    params: {},
  });
  assert.equal(res.status, 401);
});

test('a restore puts the row back exactly and drops it from the archive', async () => {
  const store = seeded();
  const { archive, expense } = await routes();
  await expense.onRequestDelete!({
    request: new Request('https://x/api/expenses/exp-1', { method: 'DELETE', headers: { Cookie: COOKIE } }),
    env: envFor(store),
    params: { id: 'exp-1' },
  });

  const res = await archive.onRequestPost!({
    request: new Request('https://x/api/expenses/archive?restore=exp-1', {
      method: 'POST',
      headers: { Cookie: COOKIE },
    }),
    env: envFor(store),
    params: {},
  });
  assert.equal(res.status, 200);

  const back = JSON.parse(store.get('customExpenses') ?? '[]') as Array<Record<string, unknown>>;
  const restored = back.find((r) => r.id === 'exp-1');
  assert.deepEqual(restored, ROW, 'the restored row is not the one that was removed');
  assert.equal((await loadArchivedExpenses(envFor(store) as never)).length, 0, 'the archive still lists the restored row');

  // Restoring again is refused rather than adding a second copy.
  const again = await archive.onRequestPost!({
    request: new Request('https://x/api/expenses/archive?restore=exp-1', { method: 'POST', headers: { Cookie: COOKIE } }),
    env: envFor(store),
    params: {},
  });
  assert.equal(again.status, 404);
});

test('a restore cannot duplicate a row already on the books', async () => {
  const store = seeded();
  const { archive } = await routes();
  // Archive it, then put it back by hand so the live list and the archive disagree.
  await archiveExpense(envFor(store) as never, ROW);
  const res = await archive.onRequestPost!({
    request: new Request('https://x/api/expenses/archive?restore=exp-1', { method: 'POST', headers: { Cookie: COOKIE } }),
    env: envFor(store),
    params: {},
  });
  assert.equal(res.status, 409, 'a second copy was added');
  const live = JSON.parse(store.get('customExpenses') ?? '[]') as Array<{ id: string }>;
  assert.equal(live.filter((r) => r.id === 'exp-1').length, 1);
});

test('the archive and the restore route need the host', async () => {
  const store = seeded();
  const { archive } = await routes();
  const list = await archive.onRequestGet!({
    request: new Request('https://x/api/expenses/archive'),
    env: envFor(store),
    params: {},
  });
  assert.equal(list.status, 401);
  // Fails closed when no password is set, which is the state production is in.
  const open = await archive.onRequestGet!({
    request: new Request('https://x/api/expenses/archive'),
    env: { SETTINGS: fakeKv(store) },
    params: {},
  });
  assert.equal(open.status, 401);
});

test('the archive listing carries no receipt bytes and no second total', async () => {
  const store = seeded();
  await archiveExpense(envFor(store) as never, ROW);
  const { archive } = await routes();
  const res = await archive.onRequestGet!({
    request: new Request('https://x/api/expenses/archive', { headers: { Cookie: COOKIE } }),
    env: envFor(store),
    params: {},
  });
  const body = (await res.json()) as { archived: Array<Record<string, unknown>>; line: string };
  assert.equal(res.status, 200);
  assert.equal(body.archived.length, 1);
  assert.equal(body.archived[0]!.hasReceipt, true);
  // The storage path itself is not published; only whether there is one.
  assert.equal(JSON.stringify(body).includes('receipts/exp-1.pdf'), false);
  assert.match(body.line, /can be restored/);
});

test('the desk line counts what can be restored and says it is not in a total', () => {
  assert.match(archiveLine([]), /Nothing can be restored/);
  const one = archiveLine([{ expense: ROW as never, removedAt: '2026-11-07T00:00:00.000Z' }]);
  assert.match(one, /1 removed expense can be restored/);
  assert.match(one, /not counted in any total/);
  assert.equal(one.includes('$'), false);
});

test('the line on the page is counted from the rows, so it cannot go stale', () => {
  // After a restore the list emptied but the server line still said one could be restored.
  assert.match(archiveCountLine(0), /Nothing has been removed/);
  assert.equal(archiveCountLine(0).includes('1 removed'), false, 'an empty list claimed a restore was available');
  assert.match(archiveCountLine(1), /^1 removed expense can be restored/);
  assert.match(archiveCountLine(3), /^3 removed expenses can be restored/);
  for (const n of [0, 1, 3, -2, 1.5]) {
    const line = archiveCountLine(n);
    assert.equal(line.includes('$'), false, line);
    assert.match(line, /not counted in any total|nothing to restore/i);
  }
});

test('finding and dropping an archived row is safe when it is not there', async () => {
  const store = seeded();
  const env = envFor(store);
  assert.equal(await findArchivedExpense(env as never, 'nope'), null);
  const rows = await unarchiveExpense(env as never, 'nope');
  assert.deepEqual(rows, []);
});
