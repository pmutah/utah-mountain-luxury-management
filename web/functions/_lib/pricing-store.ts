import { kvGet, kvPut, newId } from './kv-json';
import type { SettingsEnv } from './kv';
import { addDays } from '../../src/lib/market/dates';
import { compsForHouse } from '../../src/lib/market/comp-house';
import { PUBLISHED_UNIT_RATES, toUnitRates, type RiverUnitRates } from '../../src/lib/river-unit-rates';
import { indexSnaps, liveCompFits, toLiveComp, toLiveSnaps, type LiveComp, type SnapIndex } from '../../src/lib/market/live';
import {
  toApprovedRate,
  withApprovedRateReport,
  withApprovedRates,
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

/**
 * What the three Riverhouse units sell for.
 *
 * Kept under its own key rather than inside `listingConfig`, because `ListingConfig` is keyed by `PropertyId` and the
 * units are deliberately not properties. Storing them there would put three unit rows into every three-house read.
 *
 * A missing record means **unset**, never free: `blankUnitRates()` returns nulls, and nothing guest-facing may render a
 * null price.
 */
const KV_UNIT_RATES = 'riverUnitRates';

export async function loadRiverUnitRates(env: SettingsEnv): Promise<RiverUnitRates> {
  /*
   * The owner's published prices when the store has nothing, so the parts are sellable out of the box. A stored rate always
   * wins — `toUnitRates` reads whatever the host saved, and the fallback is only for a store that has never held one.
   */
  const stored = await kvGet<unknown>(env, KV_UNIT_RATES, null);
  return toUnitRates(stored === null ? PUBLISHED_UNIT_RATES : stored);
}

export async function saveRiverUnitRates(env: SettingsEnv, rates: RiverUnitRates): Promise<RiverUnitRates> {
  return toUnitRates(await kvPut(env, KV_UNIT_RATES, rates));
}

/**
 * The host's whole-versus-split setting for the Riverhouse.
 *
 * It lived only in component state, so every reload put the house back to `auto` — a host who had turned splitting off
 * found it on again the next morning. A setting that changes what is offered has to outlive the tab.
 *
 * An unreadable or unknown value reads as `auto`, which is the mode the app shipped with, so a corrupt row cannot
 * silently forbid splitting.
 */
const KV_SPLIT_MODE = 'riverSplitMode';

export async function loadRiverSplitMode(env: SettingsEnv): Promise<'auto' | 'suggest-only' | 'off'> {
  const raw = await kvGet<unknown>(env, KV_SPLIT_MODE, null);
  return raw === 'suggest-only' || raw === 'off' ? raw : 'auto';
}

export async function saveRiverSplitMode(
  env: SettingsEnv,
  mode: 'auto' | 'suggest-only' | 'off',
): Promise<'auto' | 'suggest-only' | 'off'> {
  const safe = mode === 'suggest-only' || mode === 'off' ? mode : 'auto';
  await kvPut(env, KV_SPLIT_MODE, safe);
  return safe;
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
 * The identifying fact is the **street address**, because that is the house. Titles are not: the real pair
 * reads `Luxury 7000 SQFT · Sleeps 20 · Orem` on VRBO and `Luxury -7000 SQFT-Sleeps 20- Bball VBall 1 Acre`
 * on Airbnb, and no title comparison can know those are one home.
 *
 * So the key is layered, strongest first:
 *
 *   1. **Address** (normalised) — two platforms for one house collide here, which is the case that matters.
 *   2. **Title + sleeps** — a fallback that still catches two titles sharing the house's own words, such as
 *      both Oasis listings. It cannot catch a house described differently, and that limitation is pinned by
 *      a test rather than glossed over.
 */
export function compHouseKey(comp: { label?: string; sleeps?: number; address?: string }): string {
  const address = String(comp.address ?? '')
    .toLowerCase()
    // Directionals abbreviate differently on each platform, so they are expanded to one form.
    .replace(/\b(north|n)\b/g, 'n ')
    .replace(/\b(south|s)\b/g, 's ')
    .replace(/\b(east|e)\b/g, 'e ')
    .replace(/\b(west|w)\b/g, 'w ')
    .replace(/\b(street|st|avenue|ave|road|rd|drive|dr|lane|ln|court|ct|circle|cir|boulevard|blvd|way|place|pl)\b/g, ' ')
    .replace(/\b(utah|ut)\b/g, ' ')
    .replace(/\b\d{5}\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
  if (address.length >= 6) return `addr:${address}`;

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

/** The saved comp that is the same house as this one, if any. Different url and platform, same property. */
export async function findSameHouse(
  env: SettingsEnv,
  comp: { label?: string; sleeps?: number; url?: string; address?: string },
): Promise<CompListing | null> {
  const list = await loadCompSet(env);

  // Same URL is the same row, whatever else is true.
  const exact = list.find((row) => row.url === String(comp.url ?? ''));
  if (exact) return exact;

  /*
   * The address is the strong signal and is checked first: two platforms for one house share a street, and
   * nothing else does. The title key is the weaker fallback — it catches two titles that share the house's
   * own words and, as a test pins, cannot catch a house each platform describes differently.
   */
  const key = compHouseKey(comp);
  if (!key) return null;
  return list.find((row) => compHouseKey(row as never) === key) ?? null;
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

/**
 * Many nights in one write.
 *
 * A loop over `saveApprovedRate` rewrites the whole sheet per night: approving a seven-night plan meant seven
 * full-value KV writes, and firing them back to back is what produced transient 503s while I climbed the
 * ladder one approval at a time on production. One read, one write, one trim.
 */
export async function saveApprovedRates(
  env: SettingsEnv,
  rows: readonly ApprovedRate[],
): Promise<{ sheet: ApprovedRate[]; dropped: number }> {
  if (rows.length === 0) return { sheet: await loadApprovedRates(env), dropped: 0 };
  const written = withApprovedRates(await loadApprovedRates(env), rows);
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

/**
 * What an automatic price read can and cannot do.
 *
 * Measured on production 2026-11-10: this function reported **17 of 19 comps unpaid**, each as "could not extract price —
 * use manual snapshot". That sentence blamed the host for work the code never attempted properly. Two facts, both checked
 * against the live pages rather than assumed:
 *
 *   1. **The HTML was truncated to 12,000 characters.** An Airbnb listing page is ~1.03 MB and its prices sit around
 *      character 942,781; a Vrbo page is ~2.1 MB. So the extractor was shown the `<head>` and nothing else, and could not
 *      have seen a price even when one is present.
 *   2. **The listing's own nightly rate is not in the static HTML at all.** On Vrbo 2453705 the only `$` figures in the
 *      document belong to *nearby* listings' `priceRange` in structured data - reading one of those would write a
 *      stranger's price onto our comp. Airbnb renders its calendar client-side. Neither is a fetch problem; both are
 *      sites that do not publish this number server-side.
 *
 * So the honest outcome for most comps is **"this channel does not publish a fetchable rate"**, and the host records the
 * ask they can see in a browser. That is not a failure of the host's comp; it is the shape of the channel.
 */
export type CompRefreshOutcome = {
  /** Comps a rate was actually written for. */
  refreshed: number;
  /** Comps skipped because a rate was already read in the last day. */
  recent: number;
  /** Per-comp notes, each naming what happened rather than only that it did not work. */
  errors: string[];
  /** True only when no Gemini key is configured, so nothing was even attempted. */
  noKey: boolean;
  /** One line for a host, counting what can and cannot be read automatically. */
  line: string;
};

export async function refreshCompPrices(
  env: SettingsEnv,
  geminiKey?: string,
): Promise<CompRefreshOutcome> {
  const comps = await loadCompSet(env);
  const errors: string[] = [];
  let refreshed = 0;
  let recent = 0;
  const sampleDate = new Date();
  sampleDate.setDate(sampleDate.getDate() + ((5 - sampleDate.getDay() + 7) % 7) + 7);
  const dateStr = sampleDate.toISOString().slice(0, 10);

  if (!geminiKey) {
    /*
     * Named separately, because "0 refreshed, 19 errors" reads as nineteen broken comps when the truth is that no
     * extractor is configured at all. The host cannot fix that by editing a comp.
     */
    return {
      refreshed: 0,
      recent: 0,
      noKey: true,
      errors: [],
      line:
        'No price extractor is configured (GEMINI_API_KEY), so no comp rate was read. Record the asks you can see in a browser.',
    };
  }

  for (const comp of comps) {
    const last = (await loadPriceSnapshots(env)).filter((s) => s.compId === comp.id).pop();
    if (last && Date.now() - new Date(last.fetchedAt).getTime() < 86400000) {
      recent++;
      continue;
    }

    try {
      const res = await fetch(comp.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PortfolioBot/1.0)' },
      });
      if (!res.ok) {
        errors.push(
          `${comp.label}: the page answered ${res.status}. ${res.status === 403 ? 'That site blocks a server-side read, so record the ask by hand.' : 'Nothing was read.'}`,
        );
        continue;
      }
      /*
       * The whole document, not the first 12,000 characters. The truncation was the bug: a listing page is around a
       * megabyte and its figures appear near the end of it, so the model was reading the `<head>` and concluding there
       * was no price.
       *
       * The prompt is bounded by *finding the target listing's own ask*, and is told to return null when the page only
       * carries nearby listings' prices - a comp priced off a neighbour is worse than no comp price at all.
       */
      const html = await res.text();
      const extractRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${encodeURIComponent(geminiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text:
                      `Find the guest-facing nightly rate in USD that THIS listing charges for ${dateStr}, in the page below. ` +
                      'Return the rate for this listing only. Do not return a host payout. Do not return a price that appears under ' +
                      '"nearby", "similar", "recommended", or another listing\'s structured data - a neighbour\'s rate is not this ' +
                      'listing\'s rate. If the page does not carry this listing\'s own nightly rate, return null. ' +
                      `Return ONLY JSON: {"nightlyRate":number|null}. PAGE:\n${html}`,
                  },
                ],
              },
            ],
            generationConfig: { responseMimeType: 'application/json', temperature: 0 },
          }),
        },
      );
      if (!extractRes.ok) {
        errors.push(`${comp.label}: the price reader answered ${extractRes.status}. Nothing was written.`);
        continue;
      }
      const json = (await extractRes.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const raw = json.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!raw) {
        errors.push(`${comp.label}: the price reader returned nothing. Nothing was written.`);
        continue;
      }
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
      /*
       * A null is an answer, not an error: the site does not publish this listing's rate server-side. Said plainly, with
       * the next step, because the old wording sent the host looking for a mistake they had not made.
       */
      errors.push(
        `${comp.label}: this site does not publish its nightly rate in the page itself, so there is nothing to read. Record the ask you see in a browser.`,
      );
    } catch (e) {
      errors.push(`${comp.label}: ${e instanceof Error ? e.message : 'the page could not be read.'}`);
    }
  }

  const unreadable = errors.length;
  return {
    refreshed,
    recent,
    noKey: false,
    errors,
    line:
      refreshed === 0
        ? `No comp rate could be read automatically${recent > 0 ? ` (${recent} already had a rate from the last day)` : ''}. ` +
          `${unreadable} ${unreadable === 1 ? 'comp reports' : 'comps report'} that this channel does not publish a fetchable rate, ` +
          'which is a fact about the site rather than a mistake in the comp. Record the asks you can see in a browser.'
        : `Read a rate for ${refreshed} ${refreshed === 1 ? 'comp' : 'comps'}${recent > 0 ? `, skipped ${recent} with a rate from the last day` : ''}. ` +
          `${unreadable > 0 ? `${unreadable} could not be read automatically; each says why.` : ''}`.trim(),
  };
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
