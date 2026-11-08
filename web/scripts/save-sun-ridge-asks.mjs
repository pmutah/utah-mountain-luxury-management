/**
 * Save SUN RIDGE's December and January asks.
 *
 * Read on 2026-11-08 from its own VRBO date picker (vrbo.com/9946275ha), host Stewart Mountain Lodging.
 * Sun Ridge already had November asks; this read fills the mid-December and January nights where River
 * had exactly one comp short of a band, which is what kept those nights out of the live band.
 *
 * Blank nights (17-19 Dec, 3-4 Jan and 6-9 Jan) are absent: a blank is unavailable, not free.
 *
 * Usage: node scripts/save-sun-ridge-asks.mjs <password>
 */
const BASE = process.env.UML_BASE ?? 'https://wilhite-portfolio.pages.dev';
const password = process.argv[2];
if (!password) {
  console.error('usage: node scripts/save-sun-ridge-asks.mjs <dashboard-password>');
  process.exit(1);
}

const LABEL = 'Sun Ridge';

const DEC = {
  1: 1239, 2: 1239, 3: 1239, 4: 1239, 5: 1239, 6: 1239, 7: 1239, 8: 1239, 9: 1239,
  10: 1217, 11: 1239, 12: 1239, 13: 1239, 14: 1303, 15: 1367, 16: 1367,
  20: 2015, 21: 2683, 22: 2736, 23: 2789, 24: 2789, 25: 2803, 26: 2803, 27: 2803,
  28: 2789, 29: 2789, 30: 2789, 31: 2789,
};
const JAN = {
  1: 2450, 2: 2146, 5: 1292,
  10: 1215, 11: 1201, 12: 1223, 13: 1223, 14: 1223, 15: 1216, 16: 1216, 17: 1216,
  18: 1222, 19: 1222, 20: 1222, 21: 1222, 22: 1215, 23: 1215, 24: 1215, 25: 1222,
  26: 1201, 27: 1222, 28: 1201, 29: 1215, 30: 1215, 31: 1201,
};

const asks = [
  ...Object.entries(DEC).map(([day, rate]) => ({ date: `2026-12-${String(day).padStart(2, '0')}`, nightlyRate: rate })),
  ...Object.entries(JAN).map(([day, rate]) => ({ date: `2027-01-${String(day).padStart(2, '0')}`, nightlyRate: rate })),
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
const comp = (set.comps ?? []).find((row) => String(row.label).toLowerCase().includes(LABEL.toLowerCase()));
if (!comp) {
  console.error(`no saved comp matching "${LABEL}"`);
  process.exit(1);
}

const res = await fetch(`${BASE}/api/pricing/snapshots`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Cookie: cookie },
  body: JSON.stringify({ compId: comp.id, asks }),
});
const body = await res.json().catch(() => null);
console.log(`${comp.label}: ${res.status}`, JSON.stringify(body));
if (!res.ok) process.exit(1);

const rates = asks.map((a) => a.nightlyRate);
console.log(`  ${asks[0].date} .. ${asks.at(-1).date} · ${asks.length} nights · $${Math.min(...rates)}-$${Math.max(...rates)}`);
