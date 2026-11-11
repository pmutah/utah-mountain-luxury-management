import { hostDenied, hostOnly } from '../../_lib/auth';
import { corsJson } from '../../_lib/data';
import { loadCalendarBlocks } from '../../_lib/calendar-store';
import { loadActiveHolds } from '../../_lib/hold-store';
import { storageReadPaused } from '../../_lib/kv-json';
import type { SettingsEnv } from '../../_lib/kv';
import { clearApprovedRate, loadApprovedRates, saveApprovedRate, saveApprovedRates } from '../../_lib/pricing-store';
import { getAllReservations } from '../../_lib/reservations-store';
import { isRealDay } from '../../../src/lib/market/dates';
import { approvalBase, approvedGuestRate, sheetLine, sheetUsable, type ApprovedRate } from '../../../src/lib/market/rate-sheet';
import { batchRows, decideBatch } from '../../../src/lib/market/rate-batch';
import { nightAsk } from '../../../src/lib/market/rates';
import { audit, auditActorFor } from '../../_lib/platform/audit-store';

type HouseId = 'ranch' | 'lindon' | 'river';

function houseFrom(value: unknown): HouseId | null {
  return value === 'ranch' || value === 'lindon' || value === 'river' ? value : null;
}

/**
 * The approved-rate sheet. Reading it writes nothing. This sheet is the only path by which a
 * comp-driven price reaches a guest, so it is host-only and it is deliberately narrow.
 */
export const onRequestGet: PagesFunction<SettingsEnv> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  const url = new URL(request.url);
  const house = houseFrom(url.searchParams.get('house'));
  let sheet;
  try {
    sheet = await loadApprovedRates(env);
  } catch (err) {
    if (storageReadPaused(err)) {
      return corsJson(request, { approved: null, storageReads: 'paused' }, 503);
    }
    const message = err instanceof Error ? err.message : 'The approved rates failed';
    return corsJson(request, { error: message }, 500);
  }
  const rows = house ? sheet.filter((row) => row.house === house) : sheet;
  return corsJson(
    request,
    {
      approved: rows,
      line: house ? sheetLine(sheet, house) : sheetLine(sheet, 'ranch'),
      storageReads: 'ok',
    },
    200,
    { 'Cache-Control': 'no-store' },
  );
};

/**
 * Approve one night's guest price. It is refused on a booked, closed, held, or paused night, and
 * it is refused outside the floor, the ceiling, and the daily cap. Those are the nights and the
 * prices the engine already decided to leave alone, so approving one would undo that decision.
 */
export const onRequestPost: PagesFunction<SettingsEnv> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  let body: { house?: unknown; date?: unknown; guest?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return corsJson(request, { error: 'Invalid JSON' }, 400);
  }
  const house = houseFrom(body.house);
  const date = typeof body.date === 'string' ? body.date.trim() : '';
  const guest = typeof body.guest === 'number' && Number.isFinite(body.guest) ? Math.round(body.guest) : 0;
  if (!house) return corsJson(request, { error: 'Choose the Ranch, the Lindon House, or the River House.' }, 400);
  if (!isRealDay(date)) return corsJson(request, { error: 'Choose a real night.' }, 400);
  if (guest <= 0) return corsJson(request, { error: 'Enter a guest price above zero.' }, 400);

  let taken: string[] = [];
  let closed: string[] = [];
  try {
    const stays = await getAllReservations(env);
    const blocks = await loadCalendarBlocks(env);
    const holds = await loadActiveHolds(env);
    const nightsOf = (checkIn: string, checkOut: string): string[] => {
      const out: string[] = [];
      let cursor = checkIn;
      while (cursor < checkOut) {
        out.push(cursor);
        cursor = addDaysLocal(cursor, 1);
      }
      return out;
    };
    for (const stay of stays) {
      if (stay.propertyId !== house || stay.status === 'cancelled') continue;
      taken.push(...nightsOf(stay.checkIn, stay.checkOut));
    }
    for (const block of blocks) {
      if (block.propertyId !== house) continue;
      closed.push(...nightsOf(block.start, block.end));
    }
    for (const hold of holds) {
      if (hold.propertyId !== house) continue;
      taken.push(...nightsOf(hold.checkIn, hold.checkOut));
    }
  } catch (err) {
    if (storageReadPaused(err)) {
      return corsJson(
        request,
        { error: 'The calendar could not be read, so no price was approved. Nothing was written.' },
        503,
      );
    }
    const message = err instanceof Error ? err.message : 'The calendar failed';
    return corsJson(request, { error: message }, 500);
  }

  // A night the calendar has taken keeps its rate: the price is not the open question there.
  if (!sheetUsable(date, { taken, closed })) {
    return corsJson(
      request,
      { error: 'That night is booked or closed, so its price stays put. Nothing was written.' },
      409,
    );
  }

  const ask = nightAsk(house, date);
  /*
   * The cap is measured from **the price this approval replaces**, not from the published card.
   *
   * Those are the same number the first time a night is priced and different every time after. The board
   * already starts from the approved price (`buildMarketBoard` takes the sheet), so it proposes the *next*
   * 8% step — $193 → $208 — while this route validated against the card and refused it, because $208 is not
   * within 8% of $179. Measured on production: the ladder broke at the second rung, so Lindon could be raised
   * once and never again, and its $421 market median was unreachable by any number of approvals.
   *
   * Reading the sheet first is what makes the route and the board agree. A night with no approval still
   * validates against the card, so the first step is unchanged.
   */
  let existing: ApprovedRate[] = [];
  try {
    existing = (await loadApprovedRates(env)).filter((row) => row.house === house && row.date === date);
  } catch (err) {
    if (storageReadPaused(err)) {
      return corsJson(
        request,
        { error: 'The approved prices could not be read, so no price was approved. Nothing was written.' },
        503,
      );
    }
    const message = err instanceof Error ? err.message : 'The approved rates failed';
    return corsJson(request, { error: message }, 500);
  }
  const currentGuest = approvalBase(ask.guest, existing);
  const allowed = approvedGuestRate([{ date, guest }], date, { guest: currentGuest, floorGuest: ask.floorGuest });
  if (allowed === null) {
    const basis =
      currentGuest === ask.guest
        ? `The card is $${ask.guest} and the floor is $${ask.floorGuest}.`
        : `That night is already approved at $${currentGuest}, the card is $${ask.guest}, and the floor is $${ask.floorGuest}.`;
    return corsJson(
      request,
      {
        error: `That price is outside what this house can quote for that night. ${basis} A raise moves at most 8% in one night, and a cut goes no lower than the 20% promotion or the floor. Nothing was written.`,
      },
      400,
    );
  }

  const row: ApprovedRate = { house, date, guest: allowed, approvedAt: new Date().toISOString() };
  let written;
  try {
    written = await saveApprovedRate(env, row);
  } catch (err) {
    if (storageReadPaused(err)) {
      return corsJson(request, { error: 'The approved price could not be saved. Nothing was written.' }, 503);
    }
    const message = err instanceof Error ? err.message : 'The save failed';
    return corsJson(request, { error: message }, 500);
  }
  const sheet = written.sheet;
  /*
   * An approved price is what a guest can be quoted, so it is recorded. The entry names the house and the night — not the
   * new number, because the sheet already holds it and the log is not a price history.
   */
  const logged = await audit(env, {
    actor: auditActorFor(request, env),
    action: 'pricing.approve',
    target: `${house} ${date}`,
    note: `One night approved${written.dropped > 0 ? `, ${written.dropped} furthest-out dropped` : ''}.`,
  });
  // A write that evicted another night's approval says so. Dropping one silently is how a whole
  // house's sheet disappeared before, so the desk is told rather than left to notice a price move.
  const droppedLine =
    written.dropped > 0
      ? ` The sheet was full, so ${written.dropped === 1 ? 'the furthest-out night was' : `${written.dropped} furthest-out nights were`} dropped. No night a guest is about to book was touched.`
      : '';
  return corsJson(
    request,
    {
      ok: true,
      approved: row,
      nights: sheet.filter((entry) => entry.house === house).length,
      dropped: written.dropped,
      line: `${sheetLine(sheet, house)}${droppedLine}`,
      ...(logged.ok ? {} : { auditFailed: logged.reason }),
    },
    201,
    { 'Cache-Control': 'no-store' },
  );
};

/**
 * Approve a whole plan in one call.
 *
 * The ladder needs one approval per night per day, and a seven-night plan climbing for two weeks is about a
 * hundred single-night calls — which is exactly the kind of work a host stops doing halfway. This takes the
 * nights a plan proposes and writes them in **one** KV write.
 *
 * It is not a bypass. `decideBatch` applies the same per-night checks the single route does — booked or closed,
 * the floor, the 8% cap measured from the price being replaced, the ceiling — and reports each night's own
 * outcome, so a refused night in the middle of a batch is visible rather than swallowed.
 */
export const onRequestPut: PagesFunction<SettingsEnv> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  let body: { house?: unknown; nights?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return corsJson(request, { error: 'Invalid JSON' }, 400);
  }
  const house = houseFrom(body.house);
  if (!house) return corsJson(request, { error: 'Choose the Ranch, the Lindon House, or the River House.' }, 400);
  if (!Array.isArray(body.nights) || body.nights.length === 0) {
    return corsJson(request, { error: 'Send at least one night to approve.' }, 400);
  }
  const requested: Array<{ date: string; guest: number }> = [];
  for (const raw of body.nights) {
    if (!raw || typeof raw !== 'object') continue;
    const row = raw as { date?: unknown; guest?: unknown };
    const date = typeof row.date === 'string' ? row.date.trim() : '';
    const guest = typeof row.guest === 'number' && Number.isFinite(row.guest) ? Math.round(row.guest) : 0;
    if (!isRealDay(date) || guest <= 0) continue;
    requested.push({ date, guest });
  }
  if (requested.length === 0) {
    return corsJson(request, { error: 'None of those nights is a real date with a price above zero.' }, 400);
  }

  let taken: string[] = [];
  let closed: string[] = [];
  let sheet: ApprovedRate[] = [];
  try {
    const stays = await getAllReservations(env);
    const blocks = await loadCalendarBlocks(env);
    const holds = await loadActiveHolds(env);
    const nightsOf = (checkIn: string, checkOut: string): string[] => {
      const out: string[] = [];
      let cursor = checkIn;
      while (cursor < checkOut) {
        out.push(cursor);
        cursor = addDaysLocal(cursor, 1);
      }
      return out;
    };
    for (const stay of stays) {
      if (stay.propertyId !== house || stay.status === 'cancelled') continue;
      taken.push(...nightsOf(stay.checkIn, stay.checkOut));
    }
    for (const block of blocks) {
      if (block.propertyId !== house) continue;
      closed.push(...nightsOf(block.start, block.end));
    }
    for (const hold of holds) {
      if (hold.propertyId !== house) continue;
      taken.push(...nightsOf(hold.checkIn, hold.checkOut));
    }
    sheet = await loadApprovedRates(env);
  } catch (err) {
    if (storageReadPaused(err)) {
      return corsJson(
        request,
        { error: 'The calendar could not be read, so no price was approved. Nothing was written.' },
        503,
      );
    }
    const message = err instanceof Error ? err.message : 'The calendar failed';
    return corsJson(request, { error: message }, 500);
  }

  const plan = decideBatch({
    house,
    requested,
    sheet,
    card: (date) => {
      const ask = nightAsk(house, date);
      return { guest: ask.guest, floorGuest: ask.floorGuest };
    },
    taken,
    closed,
  });

  const rows = batchRows(plan, new Date().toISOString());
  if (rows.length === 0) {
    return corsJson(request, { ok: false, ...plan, nights: plan.nights, written: 0 }, 200, {
      'Cache-Control': 'no-store',
    });
  }
  let written;
  try {
    written = await saveApprovedRates(env, rows);
  } catch (err) {
    if (storageReadPaused(err)) {
      return corsJson(request, { error: 'The approved prices could not be saved. Nothing was written.' }, 503);
    }
    const message = err instanceof Error ? err.message : 'The save failed';
    return corsJson(request, { error: message }, 500);
  }
  const droppedLine =
    written.dropped > 0
      ? ` The sheet was full, so ${written.dropped === 1 ? 'the furthest-out night was' : `${written.dropped} furthest-out nights were`} dropped.`
      : '';
  /*
   * A batch is the common path — the ladder approves a whole plan at once — so it is recorded too, with the count rather than
   * a hundred rows in the log. A batch of a hundred nights is one decision by one person.
   */
  const logged = await audit(env, {
    actor: auditActorFor(request, env),
    action: 'pricing.approve-batch',
    target: house,
    note: `${plan.approved} of ${requested.length} nights approved, ${plan.refused} refused.`,
  });
  return corsJson(
    request,
    {
      ok: plan.refused === 0,
      house,
      nights: plan.nights,
      approved: plan.approved,
      refused: plan.refused,
      dropped: written.dropped,
      line: `${plan.line}${droppedLine} ${sheetLine(written.sheet, house)}`.trim(),
      ...(logged.ok ? {} : { auditFailed: logged.reason }),
    },
    200,
    { 'Cache-Control': 'no-store' },
  );
};

/** Take one approval back. The night returns to the published card. */
export const onRequestDelete: PagesFunction<SettingsEnv> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  const url = new URL(request.url);
  const house = houseFrom(url.searchParams.get('house'));
  const date = url.searchParams.get('date') ?? '';
  if (!house || !isRealDay(date)) return corsJson(request, { error: 'Choose a house and a real night.' }, 400);
  let sheet;
  try {
    sheet = await clearApprovedRate(env, house, date);
  } catch (err) {
    if (storageReadPaused(err)) {
      return corsJson(request, { error: 'The approved price could not be cleared. Nothing was written.' }, 503);
    }
    const message = err instanceof Error ? err.message : 'The clear failed';
    return corsJson(request, { error: message }, 500);
  }
  const logged = await audit(env, {
    actor: auditActorFor(request, env),
    action: 'pricing.clear',
    target: `${house} ${date}`,
    note: 'Approval removed. The night returns to the published card.',
  });
  return corsJson(
    request,
    {
      ok: true,
      nights: sheet.filter((entry) => entry.house === house).length,
      line: sheetLine(sheet, house),
      ...(logged.ok ? {} : { auditFailed: logged.reason }),
    },
    200,
    { 'Cache-Control': 'no-store' },
  );
};

function addDaysLocal(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
