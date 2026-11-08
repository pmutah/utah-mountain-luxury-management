/**
 * Save "Level Up Lindon" as a Lindon comp — one of the two Lindon still needs.
 *
 * Read on 2026-11-08 from its own Airbnb page (`airbnb.com/rooms/1812553268184581512`):
 *
 *   **Entire home in Lindon, Utah.** 7 bedrooms, 17 beds, 3.5 baths, **16+ guests**. Host Ademar.
 *   Quoted for 8–15 Dec 2026 at 12 guests: **$2,908 for 7 nights, all fees included** = **$415/night**.
 *
 * This is the house that appeared earlier only through an aggregator (`agreatertown.com`, "Next Level
 * Lindon | Arcade, Pool, Hot Tub & Big Yard", property 5544318). The aggregator gave no calendar and no
 * price, so nothing could be recorded from it. Its own Airbnb page does, which is why it is usable now.
 *
 * Only the seven quoted nights are recorded. Airbnb shows a week total rather than a per-night picker for
 * this listing, so each night takes the derived $415 rather than an invented variation.
 *
 * Usage: node scripts/save-level-up-lindon.mjs <password>
 */
const BASE = process.env.UML_BASE ?? 'https://wilhite-portfolio.pages.dev';
const password = process.argv[2];
if (!password) {
  console.error('usage: node scripts/save-level-up-lindon.mjs <dashboard-password>');
  process.exit(1);
}

const COMP = {
  platform: 'airbnb',
  url: 'https://www.airbnb.com/rooms/1812553268184581512',
  label: 'Level Up Lindon · Sleeps 16 · Lindon',
  propertyId: 'lindon',
  // The page states "16+ guests" and lists 17 beds; 16 is the conservative reading of its own capacity.
  sleeps: 16,
  distanceMi: 1,
  area: 'Lindon',
};

/** 8–15 Dec 2026 is the seven-night window AirBnB quoted at $2,908, i.e. $415.43/night. */
const NIGHTS = [
  '2026-12-08', '2026-12-09', '2026-12-10', '2026-12-11',
  '2026-12-12', '2026-12-13', '2026-12-14',
];
const RATE = 415;

const asks = NIGHTS.map((date) => ({ date, nightlyRate: RATE }));

const login = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ password }),
});
if (!login.ok) {
  console.error(`login failed: ${login.status}`);
  process.exit(1);
}
const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');

const set = await fetch(`${BASE}/api/pricing/comp-set`, { headers: { Cookie: cookie } }).then((r) => r.json());
const existing = (set.comps ?? []).find((row) => row.url === COMP.url);

let compId = existing?.id;
if (existing) {
  console.log(`already saved as ${existing.id}`);
} else {
  const created = await fetch(`${BASE}/api/pricing/comp-set`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify(COMP),
  });
  const body = await created.json().catch(() => null);
  console.log(`comp-set: ${created.status}`, JSON.stringify(body));
  if (!created.ok) process.exit(1);
  compId = body.id;
}

const res = await fetch(`${BASE}/api/pricing/snapshots`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Cookie: cookie },
  body: JSON.stringify({ compId, asks }),
});
const saved = await res.json().catch(() => null);
console.log(`snapshots: ${res.status}`, JSON.stringify(saved));
if (!res.ok) process.exit(1);
console.log(`  ${asks[0].date} .. ${asks.at(-1).date} · ${asks.length} nights · $${RATE}/nt`);
