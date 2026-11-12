/**
 * The waiting list for a refund or a guardrail override.
 *
 * A host files the request. It stays `waiting` until a host marks it approved or declined. Marking it does not
 * refund anyone, publish a rate, send a text, or write an expense, a booking, or a receipt. Those stay in KV.
 * This table is market state in D1, the same place as the pricing kill switch.
 *
 * A database that cannot be read is a failure, not an empty queue. An empty queue and a missing queue are
 * different facts, and the desk has to be able to say which.
 */

import { marketDb, readRows, writeRow } from './market-db';

export type ApprovalKind = 'refund' | 'guardrail';
export type ApprovalHouse = 'ranch' | 'lindon' | 'river';
export type ApprovalStatus = 'waiting' | 'approved' | 'declined';

export type ApprovalRow = {
  id: string;
  kind: ApprovalKind;
  house: ApprovalHouse;
  summary: string;
  amountCents: number | null;
  status: ApprovalStatus;
  createdAt: string;
  decidedAt: string | null;
};

type Stored = {
  id: string;
  kind: string;
  house: string;
  summary: string;
  amount_cents: number | null;
  status: string;
  created_at: string;
  decided_at: string | null;
};

const HOUSES = new Set(['ranch', 'lindon', 'river']);
const KINDS = new Set(['refund', 'guardrail']);

/** A refund larger than this is a typo, not a stay. $50,000. */
const REFUND_CAP_CENTS = 5_000_000;
/** A nightly ask larger than this is not a guardrail this desk will hold. $20,000. */
const NIGHTLY_CAP_CENTS = 2_000_000;

export type ApprovalDraft = {
  kind: ApprovalKind;
  house: ApprovalHouse;
  summary: string;
  amountCents: number | null;
};

export type DraftResult = { ok: true; draft: ApprovalDraft } | { ok: false; error: string };

function centsOf(value: unknown): number | null {
  if (value == null || value === '') return null;
  const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  if (!Number.isFinite(number) || !Number.isInteger(number)) return NaN;
  return number;
}

/**
 * Check a filed request before it is stored.
 *
 * The summary is the host's reason. An address-shaped token is refused so a guest's contact does not land in this
 * table. The amount is cents, and it is required only for a refund.
 */
export function parseApprovalDraft(body: {
  kind?: unknown;
  house?: unknown;
  summary?: unknown;
  amountCents?: unknown;
}): DraftResult {
  if (!KINDS.has(String(body.kind))) return { ok: false, error: 'Choose a refund or a guardrail override.' };
  if (!HOUSES.has(String(body.house))) return { ok: false, error: 'Choose a house: ranch, lindon, or river.' };
  const summary = typeof body.summary === 'string' ? body.summary.trim().replace(/\s+/g, ' ') : '';
  if (summary.length < 8 || summary.length > 200) {
    return { ok: false, error: 'Write the reason in a short sentence, with no guest contact in it.' };
  }
  if (summary.includes('@') || /\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/.test(summary)) {
    return { ok: false, error: 'Leave contact details off this request. The queue keeps the reason, not a person.' };
  }
  const cents = centsOf(body.amountCents);
  if (Number.isNaN(cents)) return { ok: false, error: 'The amount has to be a whole number of cents.' };
  const kind = body.kind as ApprovalKind;
  if (kind === 'refund') {
    if (cents == null || cents <= 0 || cents > REFUND_CAP_CENTS) {
      return { ok: false, error: 'A refund needs an amount in cents, above zero and at most $50,000.' };
    }
  } else if (cents != null && (cents <= 0 || cents > NIGHTLY_CAP_CENTS)) {
    return { ok: false, error: 'A proposed nightly ask has to be above zero and at most $20,000.' };
  }
  return { ok: true, draft: { kind, house: body.house as ApprovalHouse, summary, amountCents: cents } };
}

function fromStored(row: Stored): ApprovalRow | null {
  if (!KINDS.has(row.kind) || !HOUSES.has(row.house)) return null;
  if (row.status !== 'waiting' && row.status !== 'approved' && row.status !== 'declined') return null;
  return {
    id: row.id,
    kind: row.kind as ApprovalKind,
    house: row.house as ApprovalHouse,
    summary: row.summary,
    amountCents: row.amount_cents == null ? null : Number(row.amount_cents),
    status: row.status,
    createdAt: row.created_at,
    decidedAt: row.decided_at,
  };
}

export type ApprovalList = { ok: true; items: ApprovalRow[] } | { ok: false; reason: string };

export async function listApprovals(env: unknown): Promise<ApprovalList> {
  if (!marketDb(env)) return { ok: false, reason: 'The market database is not bound, so the queue cannot be read.' };
  const rows = await readRows<Stored>(
    env,
    `SELECT id, kind, house, summary, amount_cents, status, created_at, decided_at
     FROM approval_queue
     ORDER BY created_at DESC
     LIMIT 40`,
  );
  if (!rows.ok) return { ok: false, reason: rows.reason };
  return { ok: true, items: rows.rows.map(fromStored).filter((row): row is ApprovalRow => row != null) };
}

export type ApprovalWrite = { ok: true; item: ApprovalRow } | { ok: false; reason: string };

export async function fileApproval(env: unknown, id: string, draft: ApprovalDraft, now: Date = new Date()): Promise<ApprovalWrite> {
  if (!marketDb(env)) return { ok: false, reason: 'The market database is not bound, so the request was not filed.' };
  const createdAt = now.toISOString();
  const written = await writeRow(
    env,
    `INSERT INTO approval_queue (id, kind, house, summary, amount_cents, status, created_at, decided_at)
     VALUES (?, ?, ?, ?, ?, 'waiting', ?, NULL)`,
    id,
    draft.kind,
    draft.house,
    draft.summary,
    draft.amountCents,
    createdAt,
  );
  if (!written.ok) return { ok: false, reason: written.reason };
  return {
    ok: true,
    item: {
      id,
      kind: draft.kind,
      house: draft.house,
      summary: draft.summary,
      amountCents: draft.amountCents,
      status: 'waiting',
      createdAt,
      decidedAt: null,
    },
  };
}

export async function decideApproval(
  env: unknown,
  id: string,
  decision: 'approved' | 'declined',
  now: Date = new Date(),
): Promise<ApprovalWrite> {
  if (!/^[A-Za-z0-9-]{8,80}$/.test(id)) return { ok: false, reason: 'That request is not in the queue.' };
  if (!marketDb(env)) return { ok: false, reason: 'The market database is not bound, so the decision was not saved.' };
  const found = await readRows<Stored>(
    env,
    `SELECT id, kind, house, summary, amount_cents, status, created_at, decided_at
     FROM approval_queue WHERE id = ?`,
    id,
  );
  if (!found.ok) return { ok: false, reason: found.reason };
  const row = found.rows.map(fromStored).find((item): item is ApprovalRow => item != null);
  if (!row) return { ok: false, reason: 'That request is not in the queue.' };
  if (row.status !== 'waiting') return { ok: false, reason: 'That request was already decided. It was not changed again.' };
  const decidedAt = now.toISOString();
  const written = await writeRow(
    env,
    `UPDATE approval_queue SET status = ?, decided_at = ? WHERE id = ? AND status = 'waiting'`,
    decision,
    decidedAt,
    id,
  );
  if (!written.ok) return { ok: false, reason: written.reason };
  return { ok: true, item: { ...row, status: decision, decidedAt } };
}

const HOUSE_NAME: Record<ApprovalHouse, string> = { ranch: 'Ranch', lindon: 'Lindon', river: 'River' };

function money(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

/** A line for the desk. It never claims a text went out or a book changed. */
export function approvalLine(row: ApprovalRow): string {
  const house = HOUSE_NAME[row.house];
  const amount = row.amountCents == null ? '' : ` of ${money(row.amountCents)}`;
  const what = row.kind === 'refund' ? `refund${amount}` : `guardrail override${amount}`;
  const tail =
    row.kind === 'refund'
      ? 'Nothing was texted, and no booking, expense, or receipt was changed.'
      : 'Nothing was published, nothing was texted, and no booking, expense, or receipt was changed.';
  const state = row.status === 'waiting' ? 'is waiting' : row.status === 'approved' ? 'was marked approved' : 'was marked declined';
  return `${house} ${what} ${state}. ${row.summary} ${tail}`;
}
