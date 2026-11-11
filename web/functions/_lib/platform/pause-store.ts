/**
 * The per-house pricing kill switch.
 *
 * The plan's guardrails require one. The Market board had a Pause button that toggled React state and nothing else, and the
 * authoritative rate plan hard-coded `paused: false` for every house — so the switch a host pressed was not the switch the
 * plan read. This makes it one stored fact both of them read.
 *
 * Stored in D1, not KV, because it is market state and the plan already puts market rows there. No expense, booking, or
 * receipt is involved. A missing binding or a failed read reports **unreadable**, which the plan treats as paused: a switch
 * that cannot be read must not behave as if it were off.
 */

import { marketDb, readRows, writeRow } from './market-db';

export type HouseId = 'ranch' | 'lindon' | 'river';
export const HOUSES: HouseId[] = ['ranch', 'lindon', 'river'];

export type PauseState = Record<HouseId, boolean>;

export const ALL_UNPAUSED: PauseState = { ranch: false, lindon: false, river: false };
export const ALL_PAUSED: PauseState = { ranch: true, lindon: true, river: true };

export type PauseRead =
  | { ok: true; paused: PauseState; reasons: Partial<Record<HouseId, string>> }
  /** The switch could not be read. A caller must treat this as paused, not as off. */
  | { ok: false; paused: PauseState; why: string };

function isHouse(value: unknown): value is HouseId {
  return value === 'ranch' || value === 'lindon' || value === 'river';
}

/**
 * What the switch currently says.
 *
 * A house with no row is **not paused** — the switch has never been set — but a database that cannot be reached is
 * **every house paused**, because the alternative is a plan that prices a house whose kill switch might be on.
 */
export async function readPause(env: unknown): Promise<PauseRead> {
  if (!marketDb(env)) {
    return { ok: false, paused: ALL_PAUSED, why: 'The market database is not bound, so the kill switch cannot be read.' };
  }
  const rows = await readRows<{ house: string; paused: number; reason: string | null }>(
    env,
    'SELECT house, paused, reason FROM house_pause',
  );
  if (!rows.ok) return { ok: false, paused: ALL_PAUSED, why: rows.reason };
  const paused: PauseState = { ...ALL_UNPAUSED };
  const reasons: Partial<Record<HouseId, string>> = {};
  for (const row of rows.rows) {
    if (!isHouse(row.house)) continue;
    paused[row.house] = Number(row.paused) === 1;
    if (row.paused === 1 && row.reason) reasons[row.house] = row.reason;
  }
  return { ok: true, paused, reasons };
}

export type PauseWrite = { ok: true; house: HouseId; paused: boolean } | { ok: false; reason: string };

/**
 * Set one house's switch.
 *
 * Pausing is always allowed and always immediate. Unpausing needs the database to answer, because a switch that could not be
 * written must not report itself as off.
 */
export async function writePause(
  env: unknown,
  house: HouseId,
  paused: boolean,
  reason: string | null,
  now: Date = new Date(),
): Promise<PauseWrite> {
  if (!marketDb(env)) return { ok: false, reason: 'The market database is not bound, so the switch was not saved.' };
  const written = await writeRow(
    env,
    `INSERT INTO house_pause (house, paused, reason, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(house) DO UPDATE SET
       paused = excluded.paused,
       reason = excluded.reason,
       updated_at = excluded.updated_at`,
    house,
    paused ? 1 : 0,
    // A reason is only kept while the house is paused; an unpaused house has nothing to explain.
    paused ? (reason ?? '').slice(0, 200) || null : null,
    now.toISOString(),
  );
  if (!written.ok) return { ok: false, reason: written.reason };
  return { ok: true, house, paused };
}

/** A line for the desk. It never claims a rate was changed. */
export function pauseLine(house: HouseId, paused: boolean, reason?: string): string {
  const name = house === 'ranch' ? 'Ranch' : house === 'lindon' ? 'Lindon' : 'River';
  if (!paused) return `${name} is not paused. The published rates stay as they are.`;
  // The reason is typed by a person and may already end in a full stop, so one is added only when it is missing.
  const said = reason?.trim().replace(/[.!?]+$/, '');
  const why = said ? ` — ${said}.` : '';
  return `${name} is paused. No night is raised or promoted while this is on${why} The published rates stay as they are, including on nights that are already booked.`;
}
