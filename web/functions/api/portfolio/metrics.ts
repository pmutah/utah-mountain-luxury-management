import { PROPERTIES, calculateMetrics, corsJson } from '../../_lib/data';
import { mergeAllExpenses, withReceiptUrls, ensureTurnoverCleaningExpenses } from '../../_lib/expenses';
import { loadExtraCleaningFees, type SettingsEnv } from '../../_lib/kv';
import { addMonths, currentYearMonth } from '../../_lib/months';
import { syncIcalIfStale } from '../../_lib/calendar-store';
import { getAllReservations, backfillZeroPayouts } from '../../_lib/reservations-store';

export const onRequestGet: PagesFunction<SettingsEnv> = async ({ request, env }) => {
  const url = new URL(request.url);
  const month = url.searchParams.get('month') ?? currentYearMonth();
  const compare = url.searchParams.get('compare') === '1';
  await syncIcalIfStale(env);
  await backfillZeroPayouts(env);
  const fees = await loadExtraCleaningFees(env);
  let reservations = await getAllReservations(env);
  await ensureTurnoverCleaningExpenses(env, reservations);
  const allExpenses = withReceiptUrls(await mergeAllExpenses(env));
  reservations = await getAllReservations(env);
  const ranch = calculateMetrics('ranch', month, fees, allExpenses, reservations);
  const lindon = calculateMetrics('lindon', month, fees, allExpenses, reservations);

  const payload: Record<string, unknown> = {
    month,
    ranch,
    lindon,
    totalRevenue: ranch.revenue + lindon.revenue,
    totalProfit: ranch.profit + lindon.profit,
    avgOccupancy: (ranch.occupancy + lindon.occupancy) / 2,
    reservations,
    expenses: allExpenses,
    extraCleaningFees: fees,
    properties: Object.values(PROPERTIES),
  };

  if (compare) {
    const prevMonth = addMonths(month, -1);
    const prevRanch = calculateMetrics('ranch', prevMonth, fees, allExpenses, reservations);
    const prevLindon = calculateMetrics('lindon', prevMonth, fees, allExpenses, reservations);
    payload.previousMonth = prevMonth;
    payload.previous = {
      ranch: prevRanch,
      lindon: prevLindon,
      totalRevenue: prevRanch.revenue + prevLindon.revenue,
      totalProfit: prevRanch.profit + prevLindon.profit,
      avgOccupancy: (prevRanch.occupancy + prevLindon.occupancy) / 2,
    };
  }

  return corsJson(request, payload);
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
