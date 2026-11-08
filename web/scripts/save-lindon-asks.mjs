/**
 * Save the Lindon comp asks read on 2026-11-08.
 *
 * Read off the listing's own price breakdown for a real 7-night stay (Dec 8-15 2026):
 *   "7 nights x $420.57"  ->  $421/night guest ask before the weekly discount and Airbnb's discount.
 * The nightly rate is the ask, not the discounted total: a discount is a promotion the host chose for
 * that length of stay, and the band compares nightly rates.
 *
 * Usage: node scripts/save-lindon-asks.mjs <password>
 */
const BASE = process.env.UML_BASE ?? 'https://wilhite-portfolio.pages.dev';
const password = process.argv[2];
if (!password) {
  console.error('usage: node scripts/save-lindon-asks.mjs <dashboard-password>');
  process.exit(1);
}

/** comp label match, the ask per night, and the nights it was observed on. */
const READS = [
  {
    label: '1 min Lindon Temple',
    nightlyRate: 421,
    nights: [
      '2026-12-08', '2026-12-09', '2026-12-10', '2026-12-11',
      '2026-12-12', '2026-12-13', '2026-12-14',
    ],
  },
];

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
let failed = 0;

for (const read of READS) {
  const comp = (set.comps ?? []).find((row) =>
    String(row.label).toLowerCase().includes(read.label.toLowerCase()),
  );
  if (!comp) {
    console.error(`no saved comp matching "${read.label}"`);
    failed += 1;
    continue;
  }
  const asks = read.nights.map((date) => ({ date, nightlyRate: read.nightlyRate }));
  const res = await fetch(`${BASE}/api/pricing/snapshots`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ compId: comp.id, asks }),
  });
  const body = await res.json().catch(() => null);
  console.log(`${comp.label}: ${res.status}`, JSON.stringify(body));
  if (!res.ok) {
    failed += 1;
    continue;
  }
  console.log(`  ${asks[0].date} .. ${asks.at(-1).date} · ${asks.length} nights · $${read.nightlyRate}/nt`);
}

if (failed > 0) process.exit(1);
