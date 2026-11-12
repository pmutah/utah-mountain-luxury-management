/**
 * The approval queue waits. Marking a row does not touch the books and does not send a text.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type Row = {
  id: string;
  kind: string;
  house: string;
  summary: string;
  amount_cents: number | null;
  status: string;
  created_at: string;
  decided_at: string | null;
};

function memoryDb() {
  const rows: Row[] = [];
  const exec = (sql: string, values: unknown[]) => ({
    bind(...next: unknown[]) {
      return exec(sql, next);
    },
    async all() {
      if (sql.includes('WHERE id')) {
        const id = values[0];
        return { results: rows.filter((row) => row.id === id) };
      }
      return { results: [...rows].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)) };
    },
    async run() {
      if (sql.includes('INSERT')) {
        const [id, kind, house, summary, amount, created] = values;
        rows.push({
          id: String(id),
          kind: String(kind),
          house: String(house),
          summary: String(summary),
          amount_cents: amount == null ? null : Number(amount),
          status: 'waiting',
          created_at: String(created),
          decided_at: null,
        });
        return;
      }
      const [status, decided, id] = values;
      const row = rows.find((item) => item.id === id && item.status === 'waiting');
      if (row) {
        row.status = String(status);
        row.decided_at = String(decided);
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

test('a refund waits, a mark does not change it twice, and a missing database is not an empty queue', async () => {
  const { parseApprovalDraft, fileApproval, decideApproval, listApprovals, approvalLine } = await import(
    '../../../functions/_lib/platform/approval-store.ts'
  );

  const contact = parseApprovalDraft({
    kind: 'refund',
    house: 'ranch',
    summary: 'Call 801-787-4722 about the stay',
    amountCents: 16000,
  });
  assert.equal(contact.ok, false);

  const mailed = parseApprovalDraft({
    kind: 'refund',
    house: 'ranch',
    summary: 'Write guest@example.com a note',
    amountCents: 16000,
  });
  assert.equal(mailed.ok, false);

  const missing = parseApprovalDraft({ kind: 'refund', house: 'ranch', summary: 'Left a day early', amountCents: 0 });
  assert.equal(missing.ok, false);

  const draft = parseApprovalDraft({
    kind: 'refund',
    house: 'ranch',
    summary: 'Left a day early',
    amountCents: 16000,
  });
  assert.equal(draft.ok, true);
  if (!draft.ok) return;

  const unbound = await listApprovals({});
  assert.equal(unbound.ok, false);
  const refused = await fileApproval({}, '11111111-1111-1111-1111-111111111111', draft.draft);
  assert.equal(refused.ok, false, 'a missing database reported the refund as filed');

  const db = memoryDb();
  const env = { MARKET_DB: db };
  const filed = await fileApproval(env, '11111111-1111-1111-1111-111111111111', draft.draft, new Date('2026-11-12T12:00:00Z'));
  assert.equal(filed.ok, true);
  if (!filed.ok) return;
  assert.equal(filed.item.status, 'waiting');
  assert.match(approvalLine(filed.item), /Nothing was texted/);
  assert.match(approvalLine(filed.item), /no booking, expense, or receipt was changed/);

  const listed = await listApprovals(env);
  assert.equal(listed.ok, true);
  if (!listed.ok) return;
  assert.equal(listed.items.length, 1);

  const decided = await decideApproval(env, filed.item.id, 'approved', new Date('2026-11-12T13:00:00Z'));
  assert.equal(decided.ok, true);
  if (!decided.ok) return;
  assert.equal(decided.item.status, 'approved');
  assert.equal(db.rows[0]?.status, 'approved');
  assert.equal(db.rows.length, 1, 'deciding wrote a second row');

  const again = await decideApproval(env, filed.item.id, 'declined', new Date('2026-11-12T14:00:00Z'));
  assert.equal(again.ok, false);
  assert.equal(db.rows[0]?.status, 'approved', 'a second mark changed the decision');

  const route = readFileSync(join(process.cwd(), 'functions/api/platform/approvals.ts'), 'utf8');
  const store = readFileSync(join(process.cwd(), 'functions/_lib/platform/approval-store.ts'), 'utf8');
  const both = `${route}\n${store}`;
  assert.match(route, /sends: false/);
  assert.doesNotMatch(both, /twilio|getAllReservations|mergeAllExpenses|loadCustomExpenses|customExpenses/i);
});

test('the route turns an anonymous caller away and a mark does not file a second row', async () => {
  const { onRequestGet, onRequestPost } = await import('../../../functions/api/platform/approvals.ts');
  const db = memoryDb();
  const env = { MARKET_DB: db, MUSE_BOT_SECRET: 'queue-test-secret' };
  const denied = await onRequestGet({
    request: new Request('https://desk.test/api/platform/approvals'),
    env,
  } as never);
  assert.equal(denied.status, 401);

  const headers = { Authorization: 'Bearer queue-test-secret', 'Content-Type': 'application/json' };
  const filed = await onRequestPost({
    request: new Request('https://desk.test/api/platform/approvals', {
      method: 'POST',
      headers,
      body: JSON.stringify({ kind: 'guardrail', house: 'river', summary: 'Hold the holiday ask', amountCents: 90000 }),
    }),
    env,
  } as never);
  assert.equal(filed.status, 200);
  const created = (await filed.json()) as { sends: boolean; item: { id: string; status: string; line: string } };
  assert.equal(created.sends, false);
  assert.equal(created.item.status, 'waiting');
  assert.match(created.item.line, /Nothing was published/);

  const listed = await onRequestGet({
    request: new Request('https://desk.test/api/platform/approvals', { headers }),
    env,
  } as never);
  const list = (await listed.json()) as { stored: boolean; sends: boolean; items: unknown[] };
  assert.equal(list.stored, true);
  assert.equal(list.sends, false);
  assert.equal(list.items.length, 1);

  const decided = await onRequestPost({
    request: new Request('https://desk.test/api/platform/approvals', {
      method: 'POST',
      headers,
      body: JSON.stringify({ id: created.item.id, decision: 'declined' }),
    }),
    env,
  } as never);
  const marked = (await decided.json()) as { item: { status: string } };
  assert.equal(marked.item.status, 'declined');
  assert.equal(db.rows.length, 1, 'deciding wrote a second row');

  const again = await onRequestPost({
    request: new Request('https://desk.test/api/platform/approvals', {
      method: 'POST',
      headers,
      body: JSON.stringify({ id: created.item.id, decision: 'approved' }),
    }),
    env,
  } as never);
  assert.equal(again.status, 409);
  assert.equal(db.rows[0]?.status, 'declined', 'a second mark changed the decision');
});
