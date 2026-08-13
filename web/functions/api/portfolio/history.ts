import { calculateMetrics, PROPERTIES, corsJson, portfolioAvgOccupancy } from '../../_lib/data';
import { mergeAllExpenses, ensureTurnoverCleaningExpenses } from '../../_lib/expenses';
import { loadExtraCleaningFees, type SettingsEnv } from '../../_lib/kv';
import { currentYearMonth, monthRange } from '../../_lib/months';
import { getAllReservations, backfillZeroPayouts } from '../../_lib/reservations-store';

export const onRequestGet: PagesFunction<SettingsEnv> = async ({ request, env }) => {
  const url = new URL(request.url);
  const endMonth = url.searchParams.get('end') ?? url.searchParams.get('month') ?? currentYearMonth();
  const count = Math.min(24, Math.max(1, Number(url.searchParams.get('count') ?? 12)));
  const fees = await loadExtraCleaningFees(env);
  await backfillZeroPayouts(env);
  const reservations = await getAllReservations(env);
  await ensureTurnoverCleaningExpenses(env, reservations);
  const allExpenses = await mergeAllExpenses(env);
  const months = monthRange(endMonth, count);

  const history = months.map((month) => {
    const ranch = calculateMetrics('ranch', month, fees, allExpenses, reservations);
    const lindon = calculateMetrics('lindon', month, fees, allExpenses, reservations);
    const river = calculateMetrics('river', month, fees, allExpenses, reservations);
    return {
      month,
      ranch: {
        revenue: ranch.revenue,
        profit: ranch.profit,
        occupancy: ranch.occupancy,
        stayCount: ranch.stayCount,
      },
      lindon: {
        revenue: lindon.revenue,
        profit: lindon.profit,
        occupancy: lindon.occupancy,
        stayCount: lindon.stayCount,
      },
      river: {
        revenue: river.revenue,
        profit: river.profit,
        occupancy: river.occupancy,
        stayCount: river.stayCount,
      },
      totalRevenue: ranch.revenue + lindon.revenue + river.revenue,
      totalProfit: ranch.profit + lindon.profit + river.profit,
      avgOccupancy: portfolioAvgOccupancy(month, ranch.occupancy, lindon.occupancy, river.occupancy),
    };
  });

  return corsJson(request, { endMonth, count, history, reservations, properties: Object.values(PROPERTIES) });
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
