import { kvGet, kvPut, newId } from './kv-json';
import type { SettingsEnv } from './kv';
import { addDays } from '../../src/lib/market/dates';
import { compsForHouse } from '../../src/lib/market/comp-house';
import { indexSnaps, liveCompFits, toLiveComp, toLiveSnaps, type LiveComp, type SnapIndex } from '../../src/lib/market/live';
import {
  toApprovedRate,
  withApprovedRateReport,
  withoutApprovedRate,
  type ApprovedRate,
} from '../../src/lib/market/rate-sheet';
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
/** Host-approved guest rates. The only comp-driven price a guest can be charged. */
const KV_SHEET = 'approvedRates';

export async function loadListingConfig(
  env: SettingsEnv,
): Promise<Record<PropertyId, ListingConfig>> {
  return kvGet(env, KV_LISTINGS, { ranch: {}, lindon: {}, river: {} });
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

/**
 * A comparable is a **house**, not a URL — and the same house is listed on Airbnb and on VRBO at slightly
 * different guest prices. The Orem 7000 SQFT home quotes $527 on VRBO and $537 on Airbnb for the same
 * nights; the Orem Oasis appears on both too. Saving both would let **one landlord supply every observation
 * on a night**, so the band would read as a market while measuring one competitor.
 *
 * What this key can and cannot do, stated plainly because it matters:
 *
 * - It **does** catch a second save of the same URL, and two platform names that share the house's own
 *   words (both Oasis titles contain "Orem Oasis", for instance).
 * - It **does not** catch two platforms that describe one house with different words. The real pair proves
 *   it: VRBO calls it `Luxury 7000 SQFT · Sleeps 20 · Orem` and Airbnb calls it `Luxury -7000 SQFT-Sleeps 20-
 *   Bball VBall 1 Acre`, which reduce to `luxury orem` and `luxury bball vball 1 acre`. A title comparison
 *   cannot know those are one home.
 *
 * So this is a duplicate *discourager*, not proof. The reliable check is the host plus the street address,
 * which the listings carry but this store does not yet capture. Until it does, a wrong second save is
 * caught by the ask data (two comps on identical nights at near-identical rates are worth a look), and the
 * honest statement is that URL equality is guaranteed while cross-platform identity is best-effort.
 */
export function compHouseKey(comp: { label?: string; sleeps?: number }): string {
  const title = String(comp.label ?? '')
    .toLowerCase()
    // Platform-specific decoration: our own suffix, sizing claims, and punctuation.
    .replace(/\b(sleeps?|slps?)\s*\d+\+?/g, ' ')
    .replace(/\b\d+\s*(sq\.?\s*ft|sqft|bd|br|bedrooms?|bath|baths?)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
  return `${title}|${comp.sleeps ?? ''}`;
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

/** The saved comp that is the same house as this one, if any. Different url, same property. */
export async function findSameHouse(
  env: SettingsEnv,
  comp: { label?: string; sleeps?: number; url?: string },
): Promise<CompListing | null> {
  const list = await loadCompSet(env);
  const url = String(comp.url ?? '');
  const exact = list.find((row) => row.url === url);
  if (exact) return exact;
  const key = compHouseKey(comp);
  if (!key || key.endsWith('|')) return null;
  return list.find((row) => compHouseKey(row) === key) ?? null;
}

export async function removeCompListing(env: SettingsEnv, id: string): Promise<boolean> {
  const list = await loadCompSet(env);
  const next = list.filter((c) => c.id !== id);
  if (next.length === list.length) return false;
  await kvPut(env, KV_COMP, next);
  return true;
}

/**
 * Correct the facts on a saved comp that decide whether it may set a nightly band.
 *
 * Only the fields passed are changed, so marking a comp as ours does not clear its minimum stay and
 * setting a minimum stay does not unmark it. Every other row, and every saved ask, is left alone.
 */
export async function setCompFlags(
  env: SettingsEnv,
  id: string,
  patch: { isOwn?: boolean; minNights?: number },
): Promise<CompListing | null> {
  const list = await loadCompSet(env);
  const index = list.findIndex((c) => c.id === id);
  if (index < 0) return null;
  const next = [...list];
  next[index] = { ...list[index]!, ...patch };
  await kvPut(env, KV_COMP, next);
  return next[index]!;
}

export async function loadPriceSnapshots(env: SettingsEnv): Promise<PriceSnapshot[]> {
  return kvGet(env, KV_SNAPSHOTS, []);
}

export async function addPriceSnapshot(
  env: SettingsEnv,
  snap: Omit<PriceSnapshot, 'fetchedAt'>,
): Promise<PriceSnapshot> {
  const [item] = await addPriceSnapshots(env, [snap]);
  return item!;
}

/**
 * Save a run of nights in **one** write.
 *
 * Cloudflare KV allows one write per key per second, and the ask route used to call
 * `addPriceSnapshot` once per night: a five-night save did five read-modify-writes to
 * `priceSnapshots` inside that second, the later ones failed, and the route answered
 * 503 `saved: 1` — a run half-saved while the route's own contract says a bad save writes
 * nothing. One write for the whole run is both correct and cheaper.
 *
 * A night already saved keeps one row: this is a price, and the newer read of the same night
 * replaces the older one rather than stacking a second row on it.
 */
export async function addPriceSnapshots(
  env: SettingsEnv,
  snaps: ReadonlyArray<Omit<PriceSnapshot, 'fetchedAt'>>,
): Promise<PriceSnapshot[]> {
  if (snaps.length === 0) return [];
  const fetchedAt = new Date().toISOString();
  const items: PriceSnapshot[] = snaps.map((snap) => ({ ...snap, fetchedAt }));
  const list = await loadPriceSnapshots(env);

  // Later rows win for the same comp and night, so a re-record corrects rather than duplicates.
  const key = (snap: { compId: string; date: string }) => `${snap.compId}|${snap.date}`;
  const incoming = new Map(items.map((item) => [key(item), item]));
  const kept = list.filter((row) => !incoming.has(key(row)));
  const next = [...kept, ...items];

  await kvPut(env, KV_SNAPSHOTS, next.slice(-500));
  return items;
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

/** Every approved rate on the sheet. A row that cannot be trusted is dropped on read. */
export async function loadApprovedRates(env: SettingsEnv): Promise<ApprovedRate[]> {
  const raw = await kvGet<unknown[]>(env, KV_SHEET, []);
  if (!Array.isArray(raw)) return [];
  const out: ApprovedRate[] = [];
  for (const value of raw) {
    const row = toApprovedRate(value);
    if (row) out.push(row);
  }
  return out;
}

/**
 * Save one approved night. A second approval for that night replaces the first.
 *
 * `dropped` is how many nights the cap evicted to make room. It is returned rather than swallowed
 * because the previous version silently erased a whole house's sheet, and nothing surfaced it.
 */
export async function saveApprovedRate(
  env: SettingsEnv,
  row: ApprovedRate,
): Promise<{ sheet: ApprovedRate[]; dropped: number }> {
  const written = withApprovedRateReport(await loadApprovedRates(env), row);
  await kvPut(env, KV_SHEET, written.sheet);
  return written;
}

/** Take one house's approval back off the sheet for that night. */
export async function clearApprovedRate(env: SettingsEnv, house: string, date: string): Promise<ApprovedRate[]> {
  const sheet = withoutApprovedRate(await loadApprovedRates(env), house, date);
  await kvPut(env, KV_SHEET, sheet);
  return sheet;
}

export function median(values: number[]): number {  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * The saved comps that may set a band for this house.
 *
 * This is the **one** definition, used by the board and by the market comparison. It had drifted: the
 * board filtered through `liveCompFits`, while `compareMarket` selected by house alone. That second path
 * built an alert reading "Comp median $324/night (20 data points)" out of comps the board correctly
 * rejects — our own Ranch House and a listing that only books 28-night stays — so the alert described a
 * market that does not exist. A comp must belong to the house, be a real listing, and pass the fit rules.
 */
export async function loadBandComps(env: SettingsEnv, house: 'ranch' | 'lindon' | 'river'): Promise<LiveComp[]> {
  /*
   * Only this house's comps. A comp saved without a house used to count for every house, which put
   * the River House's canyon lodge in the Lindon House's band beside a $210 rambler.
   */
  return compsForHouse(await loadCompSet(env), house)
    .map((comp) => toLiveComp(comp))
    .filter((comp): comp is LiveComp => comp !== null)
    .filter((comp) => liveCompFits(house, comp.sleeps, comp.distanceMi, comp.isOwn, comp.minNights));
}

/**
 * The saved comps that can carry a real ask, and the asks they carry. A comp without a sleep count
 * or a distance stays off the band rather than guessing one, and a house's own listing is skipped.
 */
export async function loadLiveNights(
  env: SettingsEnv,
  house: 'ranch' | 'lindon' | 'river',
  from: string,
  days: number,
): Promise<{ comps: LiveComp[]; index: SnapIndex }> {
  const live = await loadBandComps(env, house);
  if (live.length === 0) return { comps: [], index: new Map() };
  const ids = new Set(live.map((comp) => comp.id));
  const until = addDays(from, days);
  const snaps = toLiveSnaps(await loadPriceSnapshots(env)).filter(
    (snap) => ids.has(snap.compId) && snap.date >= from && snap.date < until,
  );
  return { comps: live, index: indexSnaps(snaps) };
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
  const relevantCompIds = new Set((await loadBandComps(env, propertyId as 'ranch' | 'lindon' | 'river')).map((c) => c.id));
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
        ? 'No comp price data yet that can set a band for this house — every saved comp is either one of our own listings, a long-minimum rental, or carries no saved ask.'
        : `Comp median $${compMedian.toFixed(0)}/night for ${from} to ${to} (${rates.length} data points, from comps that pass the band rules).`,
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
                    text: `Extract the guest-facing listed nightly rate in USD from this listing page HTML for date ${dateStr}. Do not return a host payout. Return ONLY JSON: {"nightlyRate":number|null}. HTML:\n${html}`,
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
