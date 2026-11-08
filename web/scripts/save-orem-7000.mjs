/**
 * Save the Orem "Luxury 7000 SQFT, Sleeps 20" listing as a Ranch comp, with the asks read for one stay.
 *
 * Read on 2026-11-08 from its own VRBO page (`vrbo.com/2453705`):
 *
 *   Title says "Sleeps 20"; the rooms block says "6 bedrooms (sleeps 25)" and then lists **seven**
 *   bedrooms. Counting the beds — 2 twin bunks, 2 queens, 1 queen, 1 queen + 1 bunk, 1 king, 1 queen,
 *   1 futon — gives about 21, so the title's 20 is the honest figure and the "25" is inflated. 20 is also
 *   an exact match for the Ranch, which is why this comp matters.
 *
 *   Host is **"Brendon"** on the listing. That is one letter from Brandon's name, and a name regex would
 *   have wrongly marked this as one of our own listings. It is a genuine third party.
 *
 *   12 min to UVU and 14 to BYU puts it in west Orem, about 7 miles from the Ranch: inside the 10-mile band.
 *
 *   Quoted for 6–11 Dec 2026, 16 travellers: **$527 standard, $475 member price, $2,376 for 5 nights, all
 *   fees included**. The ask recorded here is the **standard rate**, because that is what the listing asks;
 *   the member price is a discount a signed-in account sees.
 *
 * Only the five quoted nights are recorded. Reading the whole picker failed on this listing (its calendar
 * renders no prices until dates are chosen), so the rest is left unrecorded rather than guessed.
 *
 * Usage: node scripts/save-orem-7000.mjs <password>
 */
const BASE = process.env.UML_BASE ?? 'https://wilhite-portfolio.pages.dev';
const password = process.argv[2];
if (!password) {
  console.error('usage: node scripts/save-orem-7000.mjs <dashboard-password>');
  process.exit(1);
}

const COMP = {
  platform: 'vrbo',
  url: 'https://www.vrbo.com/2453705',
  label: 'Luxury 7000 SQFT · Sleeps 20 · Orem',
  propertyId: 'ranch',
  sleeps: 20,
  distanceMi: 7,
  area: 'Orem',
  rating: 9.6,
  reviews: 40,
};

/** 6–11 Dec 2026 at the standard $527. The five nights actually occupied by the quote. */
const NIGHTS = ['2026-12-06', '2026-12-07', '2026-12-08', '2026-12-09', '2026-12-10'];
const RATE = 527;

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

console.log(`  ${asks[0].date} .. ${asks.at(-1).date} · ${asks.length} nights · $${RATE}/nt standard`);
