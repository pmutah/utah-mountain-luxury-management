import { calculateMetrics, portfolioAvgOccupancy } from '../../_lib/data';
import { mergeAllExpenses, withReceiptUrls } from '../../_lib/expenses';
import { generateGeminiJson } from '../../_lib/gemini-call';
import { kvGet, kvPut } from '../../_lib/kv-json';
import { loadExtraCleaningFees } from '../../_lib/kv';
import { addMonths, currentYearMonth } from '../../_lib/months';
import { getAllReservations } from '../../_lib/reservations-store';
import { corsJson } from '../../_lib/data';
import type { AgentEnv } from '../../_lib/agent/types';

function money(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(
    value || 0,
  );
}

export const onRequestGet: PagesFunction<AgentEnv> = async ({ request, env }) => {
  const url = new URL(request.url);
  const month = url.searchParams.get('month') ?? currentYearMonth();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver' }).format(new Date());
  const cacheKey = `briefing:${month}:${today}`;
  const cached = await kvGet<string>(env, cacheKey, '');
  if (cached) return corsJson(request, { line: cached, cached: true });

  const fees = await loadExtraCleaningFees(env);
  const reservations = await getAllReservations(env);
  const expenses = withReceiptUrls(await mergeAllExpenses(env));
  const ranch = calculateMetrics('ranch', month, fees, expenses, reservations);
  const lindon = calculateMetrics('lindon', month, fees, expenses, reservations);
  const river = calculateMetrics('river', month, fees, expenses, reservations);
  const prev = addMonths(month, -1);
  const prevRanch = calculateMetrics('ranch', prev, fees, expenses, reservations);
  const prevLindon = calculateMetrics('lindon', prev, fees, expenses, reservations);
  const prevRiver = calculateMetrics('river', prev, fees, expenses, reservations);
  const revenue = ranch.revenue + lindon.revenue + river.revenue;
  const prevRevenue = prevRanch.revenue + prevLindon.revenue + prevRiver.revenue;
  const facts = [
    `Month ${month}. Host payouts ${money(revenue)} versus ${money(prevRevenue)} last month.`,
    `Ranch occupancy ${ranch.occupancy.toFixed(0)}%, Lindon ${lindon.occupancy.toFixed(0)}%, River ${river.occupancy.toFixed(0)}%.`,
    `Portfolio occupancy ${portfolioAvgOccupancy(month, ranch.occupancy, lindon.occupancy, river.occupancy).toFixed(0)}%.`,
    `Today is ${today}.`,
  ].join(' ');

  if (!env.GEMINI_API_KEY) return corsJson(request, { line: '', cached: false });

  try {
    const raw = await generateGeminiJson(env.GEMINI_API_KEY, [
      {
        text: `Return JSON {"line":"..."} with one or two calm sentences for a luxury property owner. No markdown. Name one useful next action. Facts: ${facts}`,
      },
    ]);
    const parsed = JSON.parse(raw) as { line?: string; text?: string } | string;
    const line = typeof parsed === 'string' ? parsed : parsed.line || parsed.text || raw;
    const clean = String(line).replace(/^["']|["']$/g, '').trim();
    if (clean) await kvPut(env, cacheKey, clean);
    return corsJson(request, { line: clean, cached: false });
  } catch {
    return corsJson(request, { line: '', cached: false });
  }
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
