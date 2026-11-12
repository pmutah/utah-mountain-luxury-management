import { corsJson } from '../../_lib/data';
import { isOwnerToken, ownerPortalEmpty, ownerPortalView, type OwnerPortalPeriod } from '../../../src/lib/owner-portal';
import { buildOwnerStatement } from '../../../src/lib/owner-statement';
import { ownerAhead } from '../../../src/lib/owner-ahead';
import { denverToday } from '../../../src/lib/market/dates';
import { findOwnerLink, stampOwnerView } from '../../_lib/owner-store';
import { mergeAllExpenses } from '../../_lib/expenses';
import { loadCalendarBlocks } from '../../_lib/calendar-store';
import { loadExtraCleaningFees, type SettingsEnv } from '../../_lib/kv';
import { storageReadPaused } from '../../_lib/kv-json';
import { currentYearMonth } from '../../_lib/months';
import { getAllReservations } from '../../_lib/reservations-store';
import { listOwnerTransfers, recordedCents, transferLine } from '../../_lib/platform/owner-transfer-store';
import type { Expense, Reservation } from '../../../src/lib/api';

type Env = SettingsEnv & { DASHBOARD_PASSWORD?: string };

function parsePeriod(raw: string | null): OwnerPortalPeriod {
  if (raw === 'month' || raw === 'quarter' || raw === 'ttm' || raw === 'ytd') return raw;
  return 'ytd';
}

/**
 * Todd's read-only statement, opened with a minted link. Ranch and River only.
 * A paused read says so and never falls back to a stand-in ledger.
 */
export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  const token = String(params.token ?? '');
  if (!isOwnerToken(token)) return corsJson(request, { error: 'This owner link is not valid.' }, 404);
  let link;
  try {
    link = await findOwnerLink(env, token);
  } catch (err) {
    if (storageReadPaused(err)) {
      return corsJson(request, { error: 'Owner links could not be read. Nothing was written.', storageReads: 'paused' }, 503);
    }
    throw err;
  }
  if (!link) return corsJson(request, { error: 'This owner link is not valid.' }, 404);

  const url = new URL(request.url);
  const period = parsePeriod(url.searchParams.get('period'));
  const month = /^\d{4}-\d{2}$/.test(url.searchParams.get('month') ?? '')
    ? (url.searchParams.get('month') as string)
    : currentYearMonth();

  let reservations: Reservation[];
  let expenses: Expense[];
  let fees: Record<string, number>;
  try {
    reservations = (await getAllReservations(env)) as unknown as Reservation[];
    expenses = (await mergeAllExpenses(env)) as unknown as Expense[];
    fees = await loadExtraCleaningFees(env);
  } catch (err) {
    if (storageReadPaused(err)) {
      return corsJson(
        request,
        {
          error: 'Saved bookings or expenses could not be read. Nothing was written over them.',
          storageReads: 'paused',
        },
        503,
      );
    }
    const message = err instanceof Error ? err.message : 'Owner statement failed';
    return corsJson(request, { error: message }, 500);
  }

  let blocksReady = true;
  let blocks: Array<{ propertyId: string; start: string; end: string }> = [];
  try {
    blocks = await loadCalendarBlocks(env);
  } catch {
    blocksReady = false;
  }

  const statement = buildOwnerStatement(month, period, reservations, expenses, fees);
  const view = ownerPortalView(statement, period);
  const ahead = ownerAhead(reservations, denverToday(), blocksReady ? blocks : []);
  const transfers = await listOwnerTransfers(env).catch(() => ({
    ok: false as const,
    reason: 'Recorded transfers could not be read.',
  }));
  void stampOwnerView(env, token).catch(() => undefined);
  return corsJson(
    request,
    {
      ...view,
      period,
      month,
      empty: ownerPortalEmpty(view),
      storageReads: 'ok',
      ahead: {
        ...ahead,
        blocksReady,
      },
      transfers: transfers.ok
        ? {
            stored: true,
            items: transfers.items.map((item) => ({ ...item, line: transferLine(item) })),
            recordedCents: recordedCents(transfers.items),
            changesBooks: false,
          }
        : {
            stored: false,
            items: [],
            recordedCents: null,
            reason: 'Recorded transfers could not be read.',
            changesBooks: false,
          },
    },
    200,
    { 'Cache-Control': 'no-store' },
  );
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
