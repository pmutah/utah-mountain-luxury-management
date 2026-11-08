/**
 * Save The BYU Fan House as a Ranch comp — the third observation on 6–8 Dec.
 *
 * Read on 2026-11-08 from its own VRBO page (`vrbo.com/4371180`):
 *
 *   8 bedrooms, **sleeps 28**, 5 full + 5 half baths, host **Mark Crosby**, 10/10 across 19 reviews.
 *   15 min walk to UVU, which puts it in Orem about **8 miles** from the Ranch — inside the 10-mile band,
 *   and at 28 sleeps it clears the Ranch's 12-guest floor with room to spare.
 *   Quoted for 6–8 Dec 2026, 16 travellers: **$1,201/night, $2,403 for 2 nights, all fees included**,
 *   "Request to book", dates available.
 *
 * The Ranch already had two comps on those nights (Orem Oasis and the Orem 7000 SQFT). This is the third,
 * which is what the engine needs before a night is priced rather than held.
 *
 * Only the two nights actually quoted are recorded. The listing's own picker renders no prices until dates
 * are chosen, so the rest of the month is left unrecorded rather than inferred.
 *
 * Usage: node scripts/save-fan-house.mjs <password>
 */
const BASE = process.env.UML_BASE ?? 'https://wilhite-portfolio.pages.dev';
const password = process.argv[2];
if (!password) {
  console.error('usage: node scripts/save-fan-house.mjs <dashboard-password>');
  process.exit(1);
}

const COMP = {
  platform: 'vrbo',
  url: 'https://www.vrbo.com/4371180',
  label: 'The BYU Fan House · Sleeps 28 · Orem',
  propertyId: 'ranch',
  sleeps: 28,
  distanceMi: 8,
  area: 'Orem',
  rating: 10,
  reviews: 19,
};

const NIGHTS = ['2026-12-06', '2026-12-07'];
const RATE = 1201;

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
