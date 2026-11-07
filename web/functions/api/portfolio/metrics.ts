import { hostDenied, hostOnly } from '../../_lib/auth';
import { PROPERTIES, calculateMetrics, corsJson, portfolioAvgOccupancy } from '../../_lib/data';
import { mergeAllExpenses, withReceiptUrls } from '../../_lib/expenses';
import { loadExtraCleaningFees, type SettingsEnv } from '../../_lib/kv';
import { storageReadPaused } from '../../_lib/kv-json';
import { addMonths, currentYearMonth } from '../../_lib/months';
import { getAllReservations } from '../../_lib/reservations-store';

/**
 * The portfolio figures for a month.
 *
 * When the store cannot be read, this used to answer **200 with the seed data** — 75 stand-in stays
 * and 25 stand-in expenses — and the dashboard rendered those as the real books. The `storageReads:
 * 'paused'` flag was set, but nothing in the app read it, so an unreadable ledger looked exactly like
 * a healthy one showing the wrong money.
 *
 * A paused read is now a refusal, not a stand-in: 503 and a sentence saying the books could not be
 * read, which is the truth, instead of fabricated figures that add up.
 */
export const onRequestGet: PagesFunction<SettingsEnv> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  const url = new URL(request.url);
  const month = url.searchParams.get('month') ?? currentYearMonth();
  const compare = url.searchParams.get('compare') === '1';
  const calendarSync: string | null = null;
  /*
   * A paused read is not a month with no stays and no bills. Substituting the seed set made an
   * unreadable ledger look like a complete one, with numbers that reconcile. Refuse instead.
   */
  const paused = () =>
    corsJson(
      request,
      {
        error:
          'Saved bookings and expenses could not be read just now, so no figure is shown. Nothing was written over them. Try again shortly.',
        calendarSync: null,
        storageReads: 'paused',
      },
      503,
    );
  // Cleaned fees first: a store at its limit throws here too, and a default fee would be the wrong
  // money presented as the right one.
  let fees;
  try {
    fees = await loadExtraCleaningFees(env);
  } catch (err) {
    if (!storageReadPaused(err)) throw err;
    return paused();
  }
  let reservations;
  try {
    reservations = await getAllReservations(env);
  } catch (err) {
    if (!storageReadPaused(err)) throw err;
    return paused();
  }
  let allExpenses;
  try {
    allExpenses = withReceiptUrls(await mergeAllExpenses(env));
  } catch (err) {
    if (!storageReadPaused(err)) throw err;
    return paused();
  }
  const ranch = calculateMetrics('ranch', month, fees, allExpenses, reservations);
  const lindon = calculateMetrics('lindon', month, fees, allExpenses, reservations);
  const river = calculateMetrics('river', month, fees, allExpenses, reservations);

  const payload: Record<string, unknown> = {
    month,
    ranch,
    lindon,
    river,
    totalRevenue: ranch.revenue + lindon.revenue + river.revenue,
    totalProfit: ranch.profit + lindon.profit + river.profit,
    avgOccupancy: portfolioAvgOccupancy(month, ranch.occupancy, lindon.occupancy, river.occupancy),
    reservations,
    expenses: allExpenses,
    extraCleaningFees: fees,
    properties: Object.values(PROPERTIES),
    calendarSync,
    // Nothing below this point runs on a paused read, so it is always the real store.
    storageReads: 'ok' as const,
  };

  if (compare) {
    const prevMonth = addMonths(month, -1);
    const prevRanch = calculateMetrics('ranch', prevMonth, fees, allExpenses, reservations);
    const prevLindon = calculateMetrics('lindon', prevMonth, fees, allExpenses, reservations);
    const prevRiver = calculateMetrics('river', prevMonth, fees, allExpenses, reservations);
    payload.previousMonth = prevMonth;
    payload.previous = {
      ranch: prevRanch,
      lindon: prevLindon,
      river: prevRiver,
      totalRevenue: prevRanch.revenue + prevLindon.revenue + prevRiver.revenue,
      totalProfit: prevRanch.profit + prevLindon.profit + prevRiver.profit,
      avgOccupancy: portfolioAvgOccupancy(
        prevMonth,
        prevRanch.occupancy,
        prevLindon.occupancy,
        prevRiver.occupancy,
      ),
    };
  }

  return corsJson(request, payload);
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
