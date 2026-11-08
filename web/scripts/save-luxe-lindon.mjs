/**
 * Save "Luxe Home/Game room" as the third Lindon comp — the one that makes Lindon's December live.
 *
 * Read on 2026-11-08 from its own Airbnb page (`airbnb.com/rooms/1595152930979455776`):
 *
 *   **Entire home in Lindon, Utah.** 6 bedrooms, 11 beds, 3.5 baths, **16+ guests** (title says
 *   "Sleeps 20"). Quoted for 8–15 Dec 2026 at 12 guests: **$3,893 for 7 nights** = **$556/night**.
 *
 * Lindon already had `1 min Lindon Temple` and `Level Up Lindon` on these same seven nights. The engine
 * needs three overlapping observations before a night is priced rather than held, so this is the one that
 * turns seven two-comp nights into live ones — on nights this desk can actually sell (all eight were
 * verified open on our own calendar).
 *
 * Sleeps is recorded as **16**, the figure the page states in its own capacity list, not the "20" in the
 * title. A title is a marketing line; the capacity list is the listing's own fact, and the band rules want
 * the fact.
 *
 * Usage: node scripts/save-luxe-lindon.mjs <password>
 */
const BASE = process.env.UML_BASE ?? 'https://wilhite-portfolio.pages.dev';
const password = process.argv[2];
if (!password) {
  console.error('usage: node scripts/save-luxe-lindon.mjs <dashboard-password>');
  process.exit(1);
}

const COMP = {
  platform: 'airbnb',
  url: 'https://www.airbnb.com/rooms/1595152930979455776',
  label: 'Luxe Home · Game Rm · Sleeps 16 · Lindon',
  propertyId: 'lindon',
  sleeps: 16,
  distanceMi: 1,
  area: 'Lindon',
};

/** 8–15 Dec 2026, the seven nights Airbnb quoted at $3,893. */
const NIGHTS = [
  '2026-12-08', '2026-12-09', '2026-12-10', '2026-12-11',
  '2026-12-12', '2026-12-13', '2026-12-14',
];
const RATE = 556;

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
