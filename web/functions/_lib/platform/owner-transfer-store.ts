/**
 * A transfer recorded against Todd's Ranch and River share.
 *
 * The statement computes what he is owed. This list is only what a host typed as sent or returned.
 * Filing or voiding a row does not change that share, a booking, an expense, or a receipt. Lindon is
 * not a house here, because Lindon is not on his statement.
 */

import { marketDb, readRows, writeRow } from './market-db';

export type TransferHouse = 'ranch' | 'river' | 'both';
export type TransferStatus = 'recorded' | 'voided';

export type OwnerTransfer = {
  id: string;
  house: TransferHouse;
  amountCents: number;
  paidOn: string;
  note: string | null;
  status: TransferStatus;
  createdAt: string;
  voidedAt: string | null;
};

const HOUSES = new Set<TransferHouse>(['ranch', 'river', 'both']);
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const PHONE = /\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/;
/** A host may record a large quarter, not a typo with extra zeros. */
const CAP_CENTS = 20_000_000;

type TransferRow = {
  id: string;
  house: string;
  amount_cents: number;
  paid_on: string;
  note: string | null;
  status: string;
  created_at: string;
  voided_at: string | null;
};

const COLUMNS = 'id, house, amount_cents, paid_on, note, status, created_at, voided_at';

function isHouse(value: string): value is TransferHouse {
  return HOUSES.has(value as TransferHouse);
}

function realDay(value: string): boolean {
  if (!DAY.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 2018 || year > 2100) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function cleanTransferNote(value: unknown): { ok: true; note: string | null } | { ok: false; error: string } {
  if (value == null || value === '') return { ok: true, note: null };
  if (typeof value !== 'string') return { ok: false, error: 'The note has to be plain text.' };
  const note = value.replace(/\s+/g, ' ').trim();
  if (!note) return { ok: true, note: null };
  if (note.length > 160) return { ok: false, error: 'Keep the note under 160 characters.' };
  if (note.includes('@') || PHONE.test(note)) {
    return { ok: false, error: 'Leave an address and a phone number off this note.' };
  }
  return { ok: true, note };
}

export function parseOwnerTransfer(body: {
  house?: unknown;
  amountCents?: unknown;
  paidOn?: unknown;
  note?: unknown;
}): { ok: true; house: TransferHouse; amountCents: number; paidOn: string; note: string | null } | { ok: false; error: string } {
  if (body.house === 'lindon') return { ok: false, error: 'Lindon is not on Todd’s statement.' };
  if (typeof body.house !== 'string' || !isHouse(body.house)) {
    return { ok: false, error: 'Choose Ranch, River, or both.' };
  }
  if (typeof body.amountCents !== 'number' || !Number.isInteger(body.amountCents) || body.amountCents === 0) {
    return { ok: false, error: 'Enter the amount in cents, and not zero.' };
  }
  if (Math.abs(body.amountCents) > CAP_CENTS) return { ok: false, error: 'That amount is above $200,000.' };
  if (typeof body.paidOn !== 'string' || !realDay(body.paidOn)) {
    return { ok: false, error: 'Use a real date, as YYYY-MM-DD.' };
  }
  const note = cleanTransferNote(body.note);
  if (!note.ok) return note;
  return { ok: true, house: body.house, amountCents: body.amountCents, paidOn: body.paidOn, note: note.note };
}

function houseName(house: TransferHouse): string {
  if (house === 'both') return 'Ranch and River';
  return house === 'ranch' ? 'Ranch' : 'River';
}

function dollars(cents: number): string {
  return (Math.abs(cents) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export function transferLine(item: OwnerTransfer): string {
  const way = item.amountCents < 0 ? `${dollars(item.amountCents)} recorded as returned` : `${dollars(item.amountCents)} recorded as sent`;
  const tail =
    item.status === 'voided'
      ? ' This row was voided and is not in the recorded total.'
      : ' This does not change Todd’s share, a booking, or an expense.';
  return `${houseName(item.house)}: ${way} on ${item.paidOn}.${tail}`;
}

export function recordedCents(items: readonly OwnerTransfer[]): number {
  return items.reduce((sum, item) => (item.status === 'recorded' ? sum + item.amountCents : sum), 0);
}

function fromRow(row: TransferRow): OwnerTransfer | null {
  if (!isHouse(row.house)) return null;
  if (row.status !== 'recorded' && row.status !== 'voided') return null;
  return {
    id: row.id,
    house: row.house,
    amountCents: Number(row.amount_cents),
    paidOn: row.paid_on,
    note: row.note,
    status: row.status,
    createdAt: row.created_at,
    voidedAt: row.voided_at,
  };
}

export async function listOwnerTransfers(env: unknown): Promise<{ ok: true; items: OwnerTransfer[] } | { ok: false; reason: string }> {
  if (!marketDb(env)) return { ok: false, reason: 'The market database is not bound on this deployment.' };
  const read = await readRows<TransferRow>(env, `SELECT ${COLUMNS} FROM owner_transfers ORDER BY paid_on DESC, created_at DESC`);
  if (!read.ok) return read;
  return { ok: true, items: read.rows.map(fromRow).filter((row): row is OwnerTransfer => row !== null) };
}

export async function readOwnerTransfer(env: unknown, id: string): Promise<{ ok: true; item: OwnerTransfer | null } | { ok: false; reason: string }> {
  if (!marketDb(env)) return { ok: false, reason: 'The market database is not bound on this deployment.' };
  const read = await readRows<TransferRow>(env, `SELECT ${COLUMNS} FROM owner_transfers WHERE id = ?`, id);
  if (!read.ok) return read;
  return { ok: true, item: read.rows[0] ? fromRow(read.rows[0]) : null };
}

export async function fileOwnerTransfer(
  env: unknown,
  id: string,
  draft: { house: TransferHouse; amountCents: number; paidOn: string; note: string | null },
  now = new Date(),
): Promise<{ ok: true; item: OwnerTransfer } | { ok: false; reason: string }> {
  if (!marketDb(env)) return { ok: false, reason: 'The market database is not bound, so the transfer was not recorded.' };
  const createdAt = now.toISOString();
  const written = await writeRow(
    env,
    `INSERT INTO owner_transfers (${COLUMNS}) VALUES (?, ?, ?, ?, ?, 'recorded', ?, NULL)`,
    id,
    draft.house,
    draft.amountCents,
    draft.paidOn,
    draft.note,
    createdAt,
  );
  if (!written.ok) return written;
  return {
    ok: true,
    item: {
      id,
      house: draft.house,
      amountCents: draft.amountCents,
      paidOn: draft.paidOn,
      note: draft.note,
      status: 'recorded',
      createdAt,
      voidedAt: null,
    },
  };
}

export async function voidOwnerTransfer(
  env: unknown,
  id: string,
  now = new Date(),
): Promise<{ ok: true; item: OwnerTransfer } | { ok: false; reason: string }> {
  const found = await readOwnerTransfer(env, id);
  if (!found.ok) return found;
  if (!found.item) return { ok: false, reason: 'That transfer is not on the statement.' };
  if (found.item.status !== 'recorded') return { ok: false, reason: 'That transfer was already voided.' };
  const voidedAt = now.toISOString();
  const written = await writeRow(
    env,
    `UPDATE owner_transfers SET status = 'voided', voided_at = ? WHERE id = ? AND status = 'recorded'`,
    voidedAt,
    id,
  );
  if (!written.ok) return written;
  return { ok: true, item: { ...found.item, status: 'voided', voidedAt } };
}
