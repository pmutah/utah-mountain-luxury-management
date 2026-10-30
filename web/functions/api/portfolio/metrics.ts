import { PROPERTIES, calculateMetrics, corsJson, portfolioAvgOccupancy } from '../../_lib/data';
import { mergeAllExpenses, withReceiptUrls } from '../../_lib/expenses';
import { loadExtraCleaningFees, type SettingsEnv } from '../../_lib/kv';
import { addMonths, currentYearMonth } from '../../_lib/months';
import { getAllReservations } from '../../_lib/reservations-store';

export const onRequestGet: PagesFunction<SettingsEnv> = async ({ request, env }) => {
  const url = new URL(request.url);
  const month = url.searchParams.get('month') ?? currentYearMonth();
  const compare = url.searchParams.get('compare') === '1';
  const calendarSync: string | null = null;
  try {
  const fees = await loadExtraCleaningFees(env);
  const reservations = await getAllReservations(env);
  const allExpenses = withReceiptUrls(await mergeAllExpenses(env));
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
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return corsJson(request, { error: message, calendarSync }, 500);
  }
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
