import { hostDenied, hostOnly } from '../../_lib/auth';
import { calculateMetrics, PROPERTIES, corsJson, portfolioAvgOccupancy } from '../../_lib/data';
import { mergeAllExpenses } from '../../_lib/expenses';
import { loadExtraCleaningFees, type SettingsEnv } from '../../_lib/kv';
import { storageReadPaused } from '../../_lib/kv-json';
import { currentYearMonth, monthRange } from '../../_lib/months';
import { getAllReservations } from '../../_lib/reservations-store';

export const onRequestGet: PagesFunction<SettingsEnv> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  const url = new URL(request.url);
  const endMonth = url.searchParams.get('end') ?? url.searchParams.get('month') ?? currentYearMonth();
  const count = Math.min(24, Math.max(1, Number(url.searchParams.get('count') ?? 12)));
  let fees;
  try {
    fees = await loadExtraCleaningFees(env);
  } catch (err) {
    if (storageReadPaused(err)) {
      return corsJson(
        request,
        { history: null, reservations: null, storageReads: 'paused', error: 'Saved bookings could not be read. Nothing was written over them.' },
        503,
      );
    }
    throw err;
  }
  /*
   * Both reads must succeed. They used to fall back to the seed set, which made an unreadable ledger
   * render as a complete one: 75 stand-in stays and 25 stand-in expenses behind a 200. The fees read
   * already refuses before this point, so those fallbacks were unreachable — removed rather than left
   * as a trap for whoever reorders this next.
   */
  let reservations;
  try {
    reservations = await getAllReservations(env);
  } catch (err) {
    if (!storageReadPaused(err)) throw err;
    return corsJson(
      request,
      { history: null, reservations: null, storageReads: 'paused', error: 'Saved bookings could not be read. Nothing was written over them.' },
      503,
    );
  }
  let allExpenses;
  try {
    allExpenses = await mergeAllExpenses(env);
  } catch (err) {
    if (!storageReadPaused(err)) throw err;
    return corsJson(
      request,
      { history: null, reservations: null, storageReads: 'paused', error: 'Saved expenses could not be read. Nothing was written over them.' },
      503,
    );
  }
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

  return corsJson(request, {
    endMonth,
    count,
    history,
    reservations,
    properties: Object.values(PROPERTIES),
    // Nothing below this point runs on a paused read, so it is always the real store.
    storageReads: 'ok' as const,
  });
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
