import { buildSnowReport, forecastUrl } from '../src/lib/snow-report';

/**
 * The resort snow read, for `vite` in the browser.
 *
 * The deployed version lives at `functions/api/public/snow.ts`, with the same cache and the same rule: a resort that did
 * not come back is missing, not zero. Local development hits Open-Meteo directly, which is one request per reload and
 * the same shape of read the deployed route makes.
 */
export async function devPublicSnow(): Promise<{ ok: boolean; fetchedAt: string; expected: number; rows: unknown[]; source: string }> {
  const base = {
    ok: false,
    fetchedAt: new Date().toISOString(),
    expected: 16,
    rows: [] as unknown[],
    source: 'Open-Meteo modelled snowfall at upper mountain. Not a resort snow-stake measurement.',
  };
  try {
    const response = await fetch(forecastUrl(), { signal: AbortSignal.timeout(9000) });
    if (!response.ok) return base;
    const rows = buildSnowReport(await response.json());
    return { ...base, ok: rows.length > 0, rows };
  } catch {
    return base;
  }
}
