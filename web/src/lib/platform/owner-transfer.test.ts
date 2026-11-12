/**
 * A recorded transfer sits beside Todd's share. It does not change the books, and a second void is refused.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type Row = {
  id: string;
  house: string;
  amount_cents: number;
  paid_on: string;
  note: string | null;
  status: string;
  created_at: string;
  voided_at: string | null;
};

function memoryDb() {
  const rows: Row[] = [];
  const exec = (sql: string, values: unknown[]) => ({
    bind(...next: unknown[]) {
      return exec(sql, next);
    },
    async all() {
      if (sql.includes('WHERE id')) {
        return { results: rows.filter((row) => row.id === values[0]) };
      }
      return {
        results: [...rows].sort((a, b) => (a.paid_on < b.paid_on ? 1 : a.paid_on > b.paid_on ? -1 : a.created_at < b.created_at ? 1 : -1)),
      };
    },
    async run() {
      if (sql.includes('INSERT')) {
        const [id, house, amount, paidOn, note, created] = values;
        rows.push({
          id: String(id),
          house: String(house),
          amount_cents: Number(amount),
          paid_on: String(paidOn),
          note: note == null ? null : String(note),
          status: 'recorded',
          created_at: String(created),
          voided_at: null,
        });
        return;
      }
      const [voidedAt, id] = values;
      const row = rows.find((item) => item.id === id && item.status === 'recorded');
      if (row) {
        row.status = 'voided';
        row.voided_at = String(voidedAt);
      }
    },
  });
  return {
    rows,
    prepare(sql: string) {
      return exec(sql, []);
    },
  };
}

test('a transfer is recorded, a void sticks, and Lindon is refused', async () => {
  const db = memoryDb();
  const env = { MARKET_DB: db };
  const { parseOwnerTransfer, fileOwnerTransfer, voidOwnerTransfer, listOwnerTransfers, recordedCents } = await import(
    '../../../functions/_lib/platform/owner-transfer-store.ts'
  );

  assert.equal(parseOwnerTransfer({ house: 'lindon', amountCents: 100, paidOn: '2026-11-01' }).ok, false);
  assert.equal(parseOwnerTransfer({ house: 'ranch', amountCents: 0, paidOn: '2026-11-01' }).ok, false);
  assert.equal(parseOwnerTransfer({ house: 'ranch', amountCents: 100, paidOn: '2026-02-31' }).ok, false);
  const phone = parseOwnerTransfer({ house: 'ranch', amountCents: 100, paidOn: '2026-11-01', note: 'call 801-787-4722' });
  assert.equal(phone.ok, false);

  const draft = parseOwnerTransfer({ house: 'both', amountCents: 120050, paidOn: '2026-11-01', note: 'November wire' });
  assert.equal(draft.ok, true);
  if (!draft.ok) return;
  const filed = await fileOwnerTransfer(env, 'tx-1', draft, new Date('2026-11-12T12:00:00Z'));
  assert.equal(filed.ok, true);
  if (!filed.ok) return;
  assert.match(filed.item.house, /both/);

  const listed = await listOwnerTransfers(env);
  assert.equal(listed.ok, true);
  if (!listed.ok) return;
  assert.equal(recordedCents(listed.items), 120050);

  const voided = await voidOwnerTransfer(env, 'tx-1', new Date('2026-11-12T13:00:00Z'));
  assert.equal(voided.ok, true);
  const again = await voidOwnerTransfer(env, 'tx-1', new Date('2026-11-12T14:00:00Z'));
  assert.equal(again.ok, false);
  const after = await listOwnerTransfers(env);
  assert.equal(after.ok, true);
  if (!after.ok) return;
  assert.equal(recordedCents(after.items), 0);
  assert.equal(after.items[0]?.status, 'voided');

  const missing = await listOwnerTransfers({});
  assert.equal(missing.ok, false);
});

test('the host route records a transfer and does not describe a page as recorded', async () => {
  const db = memoryDb();
  const env = { MARKET_DB: db, MUSE_BOT_SECRET: 'queue-test-secret' };
  const route = (await import('../../../functions/api/platform/owner-transfers.ts')) as {
    onRequestGet: (ctx: unknown) => Promise<Response>;
    onRequestPost: (ctx: unknown) => Promise<Response>;
  };
  const headers = { Authorization: 'Bearer queue-test-secret', 'Content-Type': 'application/json' };
  const denied = await route.onRequestGet({ request: new Request('https://desk.test/api/platform/owner-transfers'), env });
  assert.equal(denied.status, 401);

  const filed = await route.onRequestPost({
    request: new Request('https://desk.test/api/platform/owner-transfers', {
      method: 'POST',
      headers,
      body: JSON.stringify({ house: 'ranch', amountCents: -50000, paidOn: '2026-10-15', note: 'returned' }),
    }),
    env,
  });
  assert.equal(filed.status, 200);
  const created = (await filed.json()) as { changesBooks: boolean; item: { line: string; id: string } };
  assert.equal(created.changesBooks, false);
  assert.match(created.item.line, /returned/);
  assert.equal(JSON.stringify(created).includes('lindon'), false);

  const listed = await route.onRequestGet({
    request: new Request('https://desk.test/api/platform/owner-transfers', { headers }),
    env,
  });
  const list = (await listed.json()) as { stored: boolean; recordedCents: number; changesBooks: boolean };
  assert.equal(list.stored, true);
  assert.equal(list.recordedCents, -50000);
  assert.equal(list.changesBooks, false);

  const source = readFileSync(join(process.cwd(), 'src/components/OwnerTransfers.tsx'), 'utf8');
  assert.match(source, /The transfer was not recorded/);
  assert.match(source, /does not change that share/);
  const routeSource = readFileSync(join(process.cwd(), 'functions/api/platform/owner-transfers.ts'), 'utf8');
  assert.match(routeSource, /refuseReadOnly/);
  assert.equal(/saveCustom|kvPut|textHost|twilio/i.test(routeSource), false);
});
