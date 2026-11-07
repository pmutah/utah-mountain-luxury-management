import { corsJson } from '../../_lib/data';
import { isOwnerToken, ownerPortalEmpty, ownerPortalView } from '../../../src/lib/owner-portal';
import { buildOwnerStatement } from '../../../src/lib/owner-statement';
import { findOwnerLink, stampOwnerView } from '../../_lib/owner-store';
import { mergeAllExpenses } from '../../_lib/expenses';
import { loadExtraCleaningFees, type SettingsEnv } from '../../_lib/kv';
import { storageReadPaused } from '../../_lib/kv-json';
import { currentYearMonth } from '../../_lib/months';
import { getAllReservations } from '../../_lib/reservations-store';
import type { Expense, Reservation } from '../../../src/lib/api';

type Env = SettingsEnv & { DASHBOARD_PASSWORD?: string };

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
  const period = url.searchParams.get('period') === 'month' ? 'month' : 'ytd';
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

  const statement = buildOwnerStatement(month, period, reservations, expenses, fees);
  const view = ownerPortalView(statement, period);
  void stampOwnerView(env, token).catch(() => undefined);
  return corsJson(
    request,
    {
      ...view,
      period,
      month,
      empty: ownerPortalEmpty(view),
      storageReads: 'ok',
    },
    200,
    { 'Cache-Control': 'no-store' },
  );
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
