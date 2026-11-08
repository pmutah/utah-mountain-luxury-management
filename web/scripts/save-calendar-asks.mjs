/**
 * Save a whole month of one comp's asks in a single request.
 *
 * The ask route already accepts a run of nights, and the calendar extractor yields date→price pairs, so
 * the two fit together: one page read becomes one write.
 *
 * Usage: node scripts/save-calendar-asks.mjs <password> <compLabelMatch> '<json date->rate>'
 *
 * The JSON is the object printed by `readVrboCalendarPrices`. Passing it as an argument rather than
 * scraping here keeps the network work in the browser session, where the page is actually rendered.
 */
const BASE = process.env.UML_BASE ?? 'https://wilhite-portfolio.pages.dev';
const [, , password, labelMatch, nightsJson] = process.argv;

if (!password || !labelMatch || !nightsJson) {
  console.error("usage: node scripts/save-calendar-asks.mjs <password> <label match> '{\"2026-11-08\":1545}'");
  process.exit(1);
}

const nights = JSON.parse(nightsJson);
const dates = Object.keys(nights).sort();

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
const comp = (set.comps ?? []).find((row) => String(row.label).toLowerCase().includes(labelMatch.toLowerCase()));
if (!comp) {
  console.error(`no saved comp matching "${labelMatch}"`);
  process.exit(1);
}

const askList = dates.map((date) => ({ date, nightlyRate: nights[date] }));
const res = await fetch(`${BASE}/api/pricing/snapshots`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Cookie: cookie },
  body: JSON.stringify({ compId: comp.id, asks: askList }),
});

const body = await res.json();
console.log(`${comp.label}: ${res.status}`, JSON.stringify(body));
if (!res.ok) process.exit(1);
console.log(`  ${dates[0]} .. ${dates.at(-1)} · ${dates.length} nights · $${Math.min(...askList.map((a) => a.nightlyRate))}–$${Math.max(...askList.map((a) => a.nightlyRate))}`);
