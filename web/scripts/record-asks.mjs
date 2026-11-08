/**
 * Record the asks that were actually read off each listing's calendar.
 *
 * Every rate here was read from the listing's own price breakdown for those exact nights, not from a
 * trailing-average or an advertised "from" price. That distinction matters: the first Orem comp showed
 * "$1,195", which is the total for five nights; the nightly figure only appears in the breakdown
 * ($245.08). Recording the total as a nightly rate would have put a 5x error into the band.
 *
 * Usage: node scripts/record-asks.mjs <password>
 */
const BASE = process.env.UML_BASE ?? 'https://wilhite-portfolio.pages.dev';
const password = process.argv[2];
if (!password) {
  console.error('usage: node scripts/record-asks.mjs <dashboard-password>');
  process.exit(1);
}

/**
 * compUrl → the nights and the per-night guest ask the listing showed.
 *
 * `nights` is the run the listing quoted one rate across. A listing that prices each night differently
 * would need one entry per night; these three quoted a single nightly figure for the run.
 */
const ASKS = [
  {
    compUrl: 'https://www.airbnb.com/rooms/1289837609259423770',
    label: 'Orem Mountain View Estate',
    from: '2026-11-09',
    nights: 5,
    nightlyRate: 245,
    source: 'Airbnb price breakdown: 5 nights x $245.08 = $1,225.40, less $30.64 discount = $1,194.76.',
  },
  {
    compUrl: 'https://www.airbnb.com/rooms/1426270095423990005',
    label: '1 min Lindon Temple',
    from: '2026-12-07',
    nights: 5,
    nightlyRate: 388,
    source: 'Airbnb price breakdown: 5 nights x $388.20 = $1,941 for 5 nights.',
  },
  {
    compUrl: 'https://www.vrbo.com/9447372ha',
    label: '8 Bedrooms 6 Kings Lindon',
    from: '2026-11-16',
    nights: 5,
    nightlyRate: 579,
    source: 'VRBO: $579 per night (was $699), Nov 16-21 2026, all fees included.',
  },
];

function eachNight(from, count) {
  const out = [];
  const [y, m, d] = from.split('-').map(Number);
  for (let i = 0; i < count; i += 1) {
    const date = new Date(Date.UTC(y, m - 1, d + i));
    out.push(date.toISOString().slice(0, 10));
  }
  return out;
}

async function main() {
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
  if (!cookie) {
    console.error('login returned no cookie');
    process.exit(1);
  }

  const setRes = await fetch(`${BASE}/api/pricing/comp-set`, { headers: { Cookie: cookie } });
  const comps = (await setRes.json()).comps ?? [];
  const byUrl = new Map(comps.map((comp) => [comp.url, comp]));

  let recorded = 0;
  for (const ask of ASKS) {
    const comp = byUrl.get(ask.compUrl);
    if (!comp) {
      console.error(`no saved comp for ${ask.label} (${ask.compUrl})`);
      continue;
    }
    const nights = eachNight(ask.from, ask.nights);
    const res = await fetch(`${BASE}/api/pricing/snapshots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        compId: comp.id,
        asks: nights.map((date) => ({ date, nightlyRate: ask.nightlyRate })),
      }),
    });
    if (!res.ok) {
      console.error(`FAILED ${ask.label}: ${res.status} ${await res.text()}`);
      continue;
    }
    console.log(`recorded ${ask.label}: $${ask.nightlyRate}/nt for ${nights[0]}..${nights.at(-1)}`);
    console.log(`  ${ask.source}`);
    recorded += 1;
  }
  console.log('');
  console.log(`recorded ${recorded} of ${ASKS.length} comps`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
