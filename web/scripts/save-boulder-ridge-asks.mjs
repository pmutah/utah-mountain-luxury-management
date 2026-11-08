/**
 * Save BOULDER RIDGE's real nightly asks.
 *
 * Read on 2026-11-08 from its own VRBO date picker (vrbo.com/3463559ha) — the two-month view with a price
 * under every available day. Boulder Ridge is already a saved River comp, but its saved URL was an
 * aggregator page (utah.com) that carries no calendar, so it had **zero asks** and could not set a band.
 * This is the first time its own numbers have been recorded.
 *
 * Nights the picker showed blank are simply absent. A blank is an unavailable night, and a zero there
 * would read as a free night.
 *
 * Usage: node scripts/save-boulder-ridge-asks.mjs <password>
 */
const BASE = process.env.UML_BASE ?? 'https://wilhite-portfolio.pages.dev';
const password = process.argv[2];
if (!password) {
  console.error('usage: node scripts/save-boulder-ridge-asks.mjs <dashboard-password>');
  process.exit(1);
}

const LABEL = 'Boulder Ridge';

/** Exactly what the picker displayed. `day: price` in the order the calendar rendered it. */
const DEC = {
  1: 690, 2: 690, 3: 690, 4: 690, 5: 690, 6: 690,
  7: 753, 8: 753, 9: 817, 10: 817, 11: 817, 12: 817, 13: 817, 14: 817, 15: 817, 16: 817,
  17: 1001,
  21: 1125, 22: 1095, 23: 1064, 24: 1064, 25: 1145, 26: 1267, 27: 1267, 28: 1267,
};
const JAN = {
  3: 901, 4: 735, 5: 735, 6: 735, 7: 845, 8: 955, 9: 845,
  10: 735, 11: 735, 12: 735, 13: 735, 14: 845, 15: 937, 16: 845,
  17: 735, 18: 735, 19: 735, 20: 735, 21: 845, 22: 955, 23: 845,
  24: 735, 25: 735, 26: 735, 27: 735, 28: 845, 29: 955, 30: 845, 31: 735,
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
