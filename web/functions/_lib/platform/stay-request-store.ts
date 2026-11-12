/**
 * Add-on requests a guest files from the stay app.
 *
 * The row waits until a host marks it noted or declined. Marking it does not move the booking, charge a card,
 * order groceries, or send a text. The stay stays in KV. This table is market state in D1.
 *
 * A database that cannot be read is a failure, not an empty list.
 */

import { marketDb, readRows, writeRow } from './market-db';

export type StayRequestKind = 'early' | 'late' | 'tub' | 'groceries';
export type StayRequestHouse = 'ranch' | 'lindon' | 'river';
export type StayRequestStatus = 'waiting' | 'noted' | 'declined';

export type StayRequestRow = {
  id: string;
  reservationId: string;
  house: StayRequestHouse;
  checkIn: string;
  checkOut: string;
  kind: StayRequestKind;
  note: string | null;
  status: StayRequestStatus;
  createdAt: string;
  decidedAt: string | null;
};

export type StayTarget = {
  reservationId: string;
  house: StayRequestHouse;
  checkIn: string;
  checkOut: string;
};

const KINDS = new Set(['early', 'late', 'tub', 'groceries']);
const HOUSES = new Set(['ranch', 'lindon', 'river']);
const KIND_NAME: Record<StayRequestKind, string> = {
  early: 'early arrival',
  late: 'later checkout',
  tub: 'hot tub',
  groceries: 'grocery drop',
};
const HOUSE_NAME: Record<StayRequestHouse, string> = { ranch: 'Ranch', lindon: 'Lindon', river: 'River' };

type Stored = {
  id: string;
  reservation_id: string;
  house: string;
  check_in: string;
  check_out: string;
  kind: string;
  note: string | null;
  status: string;
  created_at: string;
  decided_at: string | null;
};

const COLUMNS = `id, reservation_id, house, check_in, check_out, kind, note, status, created_at, decided_at`;

export function stayRequestKind(value: unknown): StayRequestKind | null {
  return KINDS.has(String(value)) ? (value as StayRequestKind) : null;
}

/** A short list. An address-shaped token is refused so contact details never land in this table. */
export function cleanStayNote(value: unknown): { ok: true; note: string | null } | { ok: false; error: string } {
  if (value == null || value === '') return { ok: true, note: null };
  if (typeof value !== 'string') return { ok: false, error: 'The note has to be a short list.' };
  const note = value.trim().replace(/\s+/g, ' ');
  if (!note) return { ok: true, note: null };
  if (note.length > 160) return { ok: false, error: 'Keep the note under 160 characters.' };
  if (note.includes('@') || /\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/.test(note)) {
    return { ok: false, error: 'Leave contact details off this request. The desk keeps the request, not a person.' };
  }
  return { ok: true, note };
}

function fromStored(row: Stored): StayRequestRow | null {
  if (!KINDS.has(row.kind) || !HOUSES.has(row.house)) return null;
  if (row.status !== 'waiting' && row.status !== 'noted' && row.status !== 'declined') return null;
  return {
    id: row.id,
    reservationId: row.reservation_id,
    house: row.house as StayRequestHouse,
    checkIn: row.check_in,
    checkOut: row.check_out,
    kind: row.kind as StayRequestKind,
    note: row.note,
    status: row.status,
    createdAt: row.created_at,
    decidedAt: row.decided_at,
  };
}

export function stayRequestLine(row: StayRequestRow): string {
  const house = HOUSE_NAME[row.house];
  const what = KIND_NAME[row.kind];
  const state = row.status === 'waiting' ? 'is waiting' : row.status === 'noted' ? 'was marked noted' : 'was marked declined';
  const note = row.note ? ` ${row.note}` : '';
  return `${house} ${what} for ${row.checkIn} to ${row.checkOut} ${state}.${note} Nothing was charged, nothing was texted, and the booking was not moved.`;
}

/** Houses a role may see. `null` means every house. Lindon stays off an owner list. */
export function visibleStayRequests(rows: readonly StayRequestRow[], allowed: readonly string[] | null): StayRequestRow[] {
  if (allowed === null) return [...rows];
  return rows.filter((row) => allowed.includes(row.house));
}

export type StayRequestRead = { ok: true; items: StayRequestRow[] } | { ok: false; reason: string };

export async function listStayRequests(env: unknown, reservationId?: string): Promise<StayRequestRead> {
  if (!marketDb(env)) return { ok: false, reason: 'The market database is not bound, so requests cannot be read.' };
  const rows = reservationId
    ? await readRows<Stored>(
        env,
        `SELECT ${COLUMNS} FROM stay_requests WHERE reservation_id = ? ORDER BY created_at DESC`,
        reservationId,
      )
    : await readRows<Stored>(env, `SELECT ${COLUMNS} FROM stay_requests ORDER BY created_at DESC LIMIT 40`);
  if (!rows.ok) return { ok: false, reason: rows.reason };
  return { ok: true, items: rows.rows.map(fromStored).filter((row): row is StayRequestRow => row != null) };
}

export type StayRequestWrite = { ok: true; item: StayRequestRow | null } | { ok: false; reason: string };

async function waitingRow(env: unknown, reservationId: string, kind: StayRequestKind): Promise<StayRequestRead & { item?: StayRequestRow | null }> {
  if (!marketDb(env)) return { ok: false, reason: 'The market database is not bound, so the request was not filed.' };
  const rows = await readRows<Stored>(
    env,
    `SELECT ${COLUMNS} FROM stay_requests WHERE reservation_id = ? AND kind = ? AND status = 'waiting'`,
    reservationId,
    kind,
  );
  if (!rows.ok) return { ok: false, reason: rows.reason };
  return { ok: true, items: [], item: rows.rows.map(fromStored).find((row) => row != null) ?? null };
}

/**
 * Turn a request on or off for one stay.
 *
 * Turning it on files one waiting row, or keeps the one already waiting. Turning it off declines that waiting row.
 * A row a host already marked is left as it is.
 */
export async function setStayRequest(
  env: unknown,
  id: string,
  stay: StayTarget,
  kind: StayRequestKind,
  on: boolean,
  note: string | null,
  now: Date = new Date(),
): Promise<StayRequestWrite> {
  const open = await waitingRow(env, stay.reservationId, kind);
  if (!open.ok) return open;
  const current = open.item ?? null;
  if (!on) {
    if (!current) return { ok: true, item: null };
    const decidedAt = now.toISOString();
    const written = await writeRow(
      env,
      `UPDATE stay_requests SET status = 'declined', decided_at = ? WHERE id = ? AND status = 'waiting'`,
      decidedAt,
      current.id,
    );
    if (!written.ok) return { ok: false, reason: written.reason };
    return { ok: true, item: { ...current, status: 'declined', decidedAt } };
  }
  if (current) {
    if (note === current.note) return { ok: true, item: current };
    const written = await writeRow(
      env,
      `UPDATE stay_requests SET note = ? WHERE id = ? AND status = 'waiting'`,
      note,
      current.id,
    );
    if (!written.ok) return { ok: false, reason: written.reason };
    return { ok: true, item: { ...current, note } };
  }
  const createdAt = now.toISOString();
  const written = await writeRow(
    env,
    `INSERT INTO stay_requests (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, 'waiting', ?, NULL)`,
    id,
    stay.reservationId,
    stay.house,
    stay.checkIn,
    stay.checkOut,
    kind,
    note,
    createdAt,
  );
  if (!written.ok) return { ok: false, reason: written.reason };
  return {
    ok: true,
    item: {
      id,
      reservationId: stay.reservationId,
      house: stay.house,
      checkIn: stay.checkIn,
      checkOut: stay.checkOut,
      kind,
      note,
      status: 'waiting',
      createdAt,
      decidedAt: null,
    },
  };
}

export async function readStayRequest(env: unknown, id: string): Promise<StayRequestWrite> {
  if (!/^[A-Za-z0-9-]{8,80}$/.test(id)) return { ok: false, reason: 'That request is not on the desk.' };
  if (!marketDb(env)) return { ok: false, reason: 'The market database is not bound, so the request cannot be read.' };
  const found = await readRows<Stored>(env, `SELECT ${COLUMNS} FROM stay_requests WHERE id = ?`, id);
  if (!found.ok) return { ok: false, reason: found.reason };
  const row = found.rows.map(fromStored).find((item): item is StayRequestRow => item != null);
  if (!row) return { ok: false, reason: 'That request is not on the desk.' };
  return { ok: true, item: row };
}

export async function decideStayRequest(
  env: unknown,
  id: string,
  decision: 'noted' | 'declined',
  now: Date = new Date(),
): Promise<StayRequestWrite> {
  const found = await readStayRequest(env, id);
  if (!found.ok) return found;
  const row = found.item;
  if (!row) return { ok: false, reason: 'That request is not on the desk.' };
  if (row.status !== 'waiting') return { ok: false, reason: 'That request was already marked. It was not changed again.' };
  const decidedAt = now.toISOString();
  const written = await writeRow(
    env,
    `UPDATE stay_requests SET status = ?, decided_at = ? WHERE id = ? AND status = 'waiting'`,
    decision,
    decidedAt,
    id,
  );
  if (!written.ok) return { ok: false, reason: written.reason };
  return { ok: true, item: { ...row, status: decision, decidedAt } };
}
