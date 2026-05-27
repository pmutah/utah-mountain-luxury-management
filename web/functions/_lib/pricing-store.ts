import { kvGet, kvPut, newId } from './kv-json';
import type { SettingsEnv } from './kv';
import type {
  CompListing,
  ListingConfig,
  PriceSnapshot,
  PricingAlert,
  PropertyId,
} from './agent/types';

const KV_LISTINGS = 'listingConfig';
const KV_COMP = 'compSet';
const KV_SNAPSHOTS = 'priceSnapshots';
const KV_ALERTS = 'pricingAlerts';

export async function loadListingConfig(
  env: SettingsEnv,
): Promise<Record<PropertyId, ListingConfig>> {
  return kvGet(env, KV_LISTINGS, { ranch: {}, lindon: {} });
}

export async function saveListingConfig(
  env: SettingsEnv,
  config: Record<PropertyId, ListingConfig>,
): Promise<Record<PropertyId, ListingConfig>> {
  return kvPut(env, KV_LISTINGS, config);
}

export async function loadCompSet(env: SettingsEnv): Promise<CompListing[]> {
  return kvGet(env, KV_COMP, []);
}

export async function addCompListing(
  env: SettingsEnv,
  comp: Omit<CompListing, 'id' | 'createdAt'>,
): Promise<CompListing> {
  const item: CompListing = { ...comp, id: newId('comp'), createdAt: new Date().toISOString() };
  const list = await loadCompSet(env);
  list.push(item);
  await kvPut(env, KV_COMP, list);
  return item;
}

export async function removeCompListing(env: SettingsEnv, id: string): Promise<boolean> {
  const list = await loadCompSet(env);
  const next = list.filter((c) => c.id !== id);
  if (next.length === list.length) return false;
  await kvPut(env, KV_COMP, next);
  return true;
}

export async function loadPriceSnapshots(env: SettingsEnv): Promise<PriceSnapshot[]> {
  return kvGet(env, KV_SNAPSHOTS, []);
}

export async function addPriceSnapshot(
  env: SettingsEnv,
  snap: Omit<PriceSnapshot, 'fetchedAt'>,
): Promise<PriceSnapshot> {
  const item: PriceSnapshot = { ...snap, fetchedAt: new Date().toISOString() };
  const list = await loadPriceSnapshots(env);
  list.push(item);
  await kvPut(env, KV_SNAPSHOTS, list.slice(-500));
  return item;
}

export async function loadPricingAlerts(env: SettingsEnv): Promise<PricingAlert[]> {
  return kvGet(env, KV_ALERTS, []);
}

export async function addPricingAlert(
  env: SettingsEnv,
  alert: Omit<PricingAlert, 'id' | 'createdAt' | 'dismissed'>,
): Promise<PricingAlert> {
  const item: PricingAlert = {
    ...alert,
    id: newId('alert'),
    createdAt: new Date().toISOString(),
    dismissed: false,
  };
  const list = await loadPricingAlerts(env);
  list.push(item);
  await kvPut(env, KV_ALERTS, list.slice(-100));
  return item;
}

export async function dismissPricingAlert(env: SettingsEnv, id: string): Promise<boolean> {
  const list = await loadPricingAlerts(env);
  const idx = list.findIndex((a) => a.id === id);
  if (idx < 0) return false;
  list[idx] = { ...list[idx]!, dismissed: true };
  await kvPut(env, KV_ALERTS, list);
  return true;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export async function compareMarket(
  env: SettingsEnv,
  propertyId: PropertyId,
  from: string,
  to: string,
): Promise<{
  compMedian: number;
  snapshotCount: number;
  openAlerts: number;
  message: string;
}> {
  const snaps = await loadPriceSnapshots(env);
  const comps = await loadCompSet(env);
  const relevantCompIds = new Set(
    comps.filter((c) => !c.propertyId || c.propertyId === propertyId || c.propertyId === 'both').map((c) => c.id),
  );
  const rates = snaps
    .filter((s) => relevantCompIds.has(s.compId) && s.date >= from && s.date <= to)
    .map((s) => s.nightlyRate);
  const compMedian = median(rates);
  const alerts = (await loadPricingAlerts(env)).filter((a) => !a.dismissed && a.propertyId === propertyId);
  return {
    compMedian,
    snapshotCount: rates.length,
    openAlerts: alerts.length,
    message:
      rates.length === 0
        ? 'No comp price data yet — add comps and refresh prices.'
        : `Comp median $${compMedian.toFixed(0)}/night for ${from} to ${to} (${rates.length} data points).`,
  };
}

export async function refreshCompPrices(
  env: SettingsEnv,
  geminiKey?: string,
): Promise<{ refreshed: number; errors: string[] }> {
  const comps = await loadCompSet(env);
  const errors: string[] = [];
  let refreshed = 0;
  const sampleDate = new Date();
  sampleDate.setDate(sampleDate.getDate() + ((5 - sampleDate.getDay() + 7) % 7) + 7);
  const dateStr = sampleDate.toISOString().slice(0, 10);

  for (const comp of comps) {
    const last = (await loadPriceSnapshots(env)).filter((s) => s.compId === comp.id).pop();
    if (last && Date.now() - new Date(last.fetchedAt).getTime() < 86400000) continue;

    if (geminiKey) {
      try {
        const res = await fetch(comp.url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PortfolioBot/1.0)' },
        });
        if (res.ok) {
          const html = (await res.text()).slice(0, 12000);
          const extractRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${encodeURIComponent(geminiKey)}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{
                  parts: [{
                    text: `Extract the nightly rate in USD from this listing page HTML for date ${dateStr}. Return ONLY JSON: {"nightlyRate":number|null}. HTML:\n${html}`,
                  }],
                }],
                generationConfig: { responseMimeType: 'application/json', temperature: 0 },
              }),
            },
          );
          if (extractRes.ok) {
            const json = (await extractRes.json()) as {
              candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
            };
            const raw = json.candidates?.[0]?.content?.parts?.[0]?.text;
            if (raw) {
              const parsed = JSON.parse(raw) as { nightlyRate?: number | null };
              if (parsed.nightlyRate && parsed.nightlyRate > 0) {
                await addPriceSnapshot(env, {
                  compId: comp.id,
                  date: dateStr,
                  nightlyRate: parsed.nightlyRate,
                  source: 'scrape',
                });
                refreshed++;
                continue;
              }
            }
          }
        }
      } catch (e) {
        errors.push(`${comp.label}: ${e instanceof Error ? e.message : 'fetch failed'}`);
      }
    }
    errors.push(`${comp.label}: could not extract price — use manual snapshot`);
  }
  return { refreshed, errors };
}

export async function runPricingAlertCheck(env: SettingsEnv): Promise<number> {
  const from = new Date().toISOString().slice(0, 10);
  const toDate = new Date();
  toDate.setDate(toDate.getDate() + 14);
  const to = toDate.toISOString().slice(0, 10);
  let created = 0;

  for (const propertyId of ['ranch', 'lindon'] as PropertyId[]) {
    const cmp = await compareMarket(env, propertyId, from, to);
    if (cmp.snapshotCount > 0 && cmp.compMedian > 0) {
      await addPricingAlert(env, {
        propertyId,
        severity: 'info',
        message: cmp.message,
        suggestedAction: 'Review your nightly rates on Airbnb/VRBO for upcoming open dates.',
      });
      created++;
    }
  }
  return created;
}
