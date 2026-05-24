import { RESERVATIONS, EXPENSES, PROPERTIES, extraCleaningFees, calculateMetrics, corsJson } from '../../_lib/data';

export const onRequestGet: PagesFunction = async ({ request }) => {
  const url = new URL(request.url);
  const month = url.searchParams.get('month') ?? '2026-07';
  const ranch = calculateMetrics('ranch', month);
  const lindon = calculateMetrics('lindon', month);
  return corsJson(request, {
    month,
    ranch,
    lindon,
    totalRevenue: ranch.revenue + lindon.revenue,
    totalProfit: ranch.profit + lindon.profit,
    avgOccupancy: (ranch.occupancy + lindon.occupancy) / 2,
    reservations: RESERVATIONS,
    expenses: EXPENSES,
    extraCleaningFees,
    properties: Object.values(PROPERTIES),
  });
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
