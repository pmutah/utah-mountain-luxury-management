/**
 * Save the Orem Oasis — a real 20-guest competitor — as a Ranch comp, with its observed asks.
 *
 * The Ranch slept 20 and had no comp that both matched its size and carried a readable calendar. Its two
 * rate-bearing comps disagreed by 68% ($240 for a sleeps-20 house against $403 for a sleeps-16), which is
 * not a market. This listing was found on VRBO's Orem group-home results and read directly:
 *
 *   vrbo.com/4413262 — "SLEEPS 20! Orem Oasis Game Room & Hot Tub Retreat"
 *   6 bedrooms, sleeps 20, host Kelton Higgins (a third party, not us), 1 min walk to UVU.
 *
 * The distance is 5 miles: Lindon to Orem near UVU by road, inside the 10-mile band.
 *
 * Usage: node scripts/save-orem-oasis.mjs <password>
 */
const BASE = process.env.UML_BASE ?? 'https://wilhite-portfolio.pages.dev';
const password = process.argv[2];
if (!password) {
  console.error('usage: node scripts/save-orem-oasis.mjs <dashboard-password>');
  process.exit(1);
}

const COMP = {
  platform: 'vrbo',
  url: 'https://www.vrbo.com/4413262',
  label: 'Orem Oasis · Sleeps 20 · Game Rm',
  propertyId: 'ranch',
  sleeps: 20,
  distanceMi: 5,
  area: 'Orem',
  rating: 9.8,
  reviews: 19,
};

/** Exactly what the picker showed. Blank days are absent — a blank is unavailable, not free. */
const DEC = {
  1: 454, 2: 462, 3: 454, 4: 498, 5: 432, 6: 514, 7: 468, 8: 490, 9: 513,
  13: 584, 15: 428, 19: 761, 20: 921, 21: 656, 22: 715, 23: 901, 24: 1013,
};
const JAN = {
  2: 474, 3: 418, 4: 383, 5: 380, 6: 419, 7: 474, 8: 450, 9: 392, 10: 391, 11: 370,
  12: 382, 13: 458, 14: 528, 15: 524, 16: 453, 17: 445, 18: 380, 19: 395, 20: 466,
  21: 514, 22: 487, 23: 437, 24: 435, 25: 422, 26: 417, 27: 482, 28: 541, 29: 510,
  30: 433, 31: 429,
};

const asks = [
  ...Object.entries(DEC).map(([d, r]) => ({ date: `2026-12-${String(d).padStart(2, '0')}`, nightlyRate: r })),
  ...Object.entries(JAN).map(([d, r]) => ({ date: `2027-01-${String(d).padStart(2, '0')}`, nightlyRate: r })),
].sort((a, b) => a.date.localeCompare(b.date));

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
  console.log(`already saved as ${existing.id}, keeping it and adding asks`);
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

const rates = asks.map((a) => a.nightlyRate);
console.log(`  ${asks[0].date} .. ${asks.at(-1).date} · ${asks.length} nights · $${Math.min(...rates)}-$${Math.max(...rates)}`);
