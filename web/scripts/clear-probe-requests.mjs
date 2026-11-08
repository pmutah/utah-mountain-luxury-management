/*
 * Clear the agent's own diagnostic booking requests.
 *
 * Two things learned the hard way here:
 *   - the inbox is CAPPED (12 rows shown of 19 saved), so a loop over `rows` never sees them all;
 *   - the summary carries no guest name, so these are matched by the exact dates I probed.
 *
 * Each discard is a full write, and Cloudflare allows one write per key per second, so the loop paces
 * itself rather than firing 19 writes in a second and getting a 429.
 */
const b = 'https://wilhite-portfolio.pages.dev';

const login = await fetch(`${b}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ password: '9ohYTj0pPzw4iHbyundZ' }),
});
const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');

/** Exactly the dates I posted during testing, as the inbox renders them. */
const PROBED_DATES = new Set([
  'Jan 10 to Jan 13',
  'Feb 8 to Feb 11',
  'Mar 8 to Mar 11',
  'Apr 12 to Apr 14',
  'May 4 to May 6',
  'Jun 7 to Jun 9',
  'Sep 21 to Sep 24',
  'Oct 5 to Oct 8',
  'Nov 2 to Nov 5',
  'Feb 1 to Feb 3',
]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function readRows() {
  const inbox = await fetch(`${b}/api/book/requests`, { headers: { Cookie: cookie } }).then((r) => r.json());
  return { rows: inbox.rows ?? [], summary: inbox.summary ?? '' };
}

let removed = 0;
let failures = 0;

for (let pass = 0; pass < 12; pass += 1) {
  const { rows } = await readRows();
  const targets = rows.filter((row) => !row.accepted && PROBED_DATES.has(String(row.dates ?? '')));
  if (targets.length === 0) break;

  for (const row of targets) {
    const res = await fetch(`${b}/api/book/discard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ id: row.id }),
    });
    if (res.ok) removed += 1;
    else {
      failures += 1;
      console.log(`  failed ${row.id} (${row.dates}): ${res.status} ${(await res.text()).slice(0, 120)}`);
    }
    // One write per key per second.
    await sleep(1100);
  }
}

const final = await readRows();
console.log(`removed ${removed}, failures ${failures}`);
console.log(`rows still shown: ${final.rows.length}`);
if (final.rows.length > 0) {
  console.log('remaining dates:');
  for (const row of final.rows) console.log(`  ${row.dates} accepted=${row.accepted}`);
}
