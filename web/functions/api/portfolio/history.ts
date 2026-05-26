import {
  calculateMetrics,
  RESERVATIONS,
  EXPENSES,
  PROPERTIES,
  corsJson,
  currentYearMonth,
} from '../../_lib/data';
import { loadExtraCleaningFees, type SettingsEnv } from '../../_lib/kv';
import { monthRange } from '../../_lib/months';

export const onRequestGet: PagesFunction<SettingsEnv> = async ({ request, env }) => {
  const url = new URL(request.url);
  const endMonth = url.searchParams.get('end') ?? url.searchParams.get('month') ?? currentYearMonth();
  const count = Math.min(24, Math.max(1, Number(url.searchParams.get('count') ?? 12)));
  const fees = await loadExtraCleaningFees(env);
  const months = monthRange(endMonth, count);

  const history = months.map((month) => {
    const ranch = calculateMetrics('ranch', month, fees);
    const lindon = calculateMetrics('lindon', month, fees);
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
      totalRevenue: ranch.revenue + lindon.revenue,
      totalProfit: ranch.profit + lindon.profit,
      avgOccupancy: (ranch.occupancy + lindon.occupancy) / 2,
    };
  });

  return corsJson(request, { endMonth, count, history, reservations: RESERVATIONS, properties: Object.values(PROPERTIES) });
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
