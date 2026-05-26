import {
  RESERVATIONS,
  EXPENSES,
  PROPERTIES,
  calculateMetrics,
  corsJson,
  currentYearMonth,
} from '../../_lib/data';
import { loadExtraCleaningFees, type SettingsEnv } from '../../_lib/kv';
import { addMonths } from '../../_lib/months';

export const onRequestGet: PagesFunction<SettingsEnv> = async ({ request, env }) => {
  const url = new URL(request.url);
  const month = url.searchParams.get('month') ?? currentYearMonth();
  const compare = url.searchParams.get('compare') === '1';
  const fees = await loadExtraCleaningFees(env);
  const ranch = calculateMetrics('ranch', month, fees);
  const lindon = calculateMetrics('lindon', month, fees);

  const payload: Record<string, unknown> = {
    month,
    ranch,
    lindon,
    totalRevenue: ranch.revenue + lindon.revenue,
    totalProfit: ranch.profit + lindon.profit,
    avgOccupancy: (ranch.occupancy + lindon.occupancy) / 2,
    reservations: RESERVATIONS,
    expenses: EXPENSES,
    extraCleaningFees: fees,
    properties: Object.values(PROPERTIES),
  };

  if (compare) {
    const prevMonth = addMonths(month, -1);
    const prevRanch = calculateMetrics('ranch', prevMonth, fees);
    const prevLindon = calculateMetrics('lindon', prevMonth, fees);
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
