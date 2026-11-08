/**
 * Save the approved comps to production.
 *
 * Every row here was read off a real listing during this session: the sleeps count is the listing's
 * own advertised capacity, and the distance is a road-distance estimate from our address to the
 * listing's neighbourhood. No ask is written — a comp with no ask sets no band, which is correct
 * until a night's price has actually been read.
 *
 * Usage: node scripts/save-comps.mjs <password>
 */
const BASE = process.env.UML_BASE ?? 'https://wilhite-portfolio.pages.dev';
const password = process.argv[2];
if (!password) {
  console.error('usage: node scripts/save-comps.mjs <dashboard-password>');
  process.exit(1);
}

/**
 * house, label, url, platform, sleeps, distanceMi, area
 *
 * `both` is used for nothing here: these are single-house comps. A comp marked `both` would price
 * the Ranch and the River together, which none of these do.
 */
const COMPS = [
  // ---- Ranch House: the 20-guest Lindon/Pleasant Grove group-home market ----
  {
    house: 'ranch',
    label: '8 Bedrooms · 6 Kings · Cinema & Arcade',
    url: 'https://www.vrbo.com/9447372ha',
    platform: 'vrbo',
    sleeps: 20,
    distanceMi: 1,
    area: 'Lindon',
    note: 'Published $838/nt, was $914. The closest true 20-guest comp to the Ranch.',
  },
  {
    house: 'ranch',
    label: 'Grove Collective · 2 Kitchens',
    url: 'https://www.hotala.com/property/grove-collective-2-kitchens-firepit-yard/HA-3215356487',
    platform: 'vrbo',
    sleeps: 12,
    distanceMi: 4,
    area: 'Pleasant Grove',
    note: 'Published from $620/nt. 6BR, two kitchens, firepit.',
  },
  {
    house: 'ranch',
    label: 'Rare Find! Epic Group Retreat',
    url: 'https://www.hotala.com/property/rare-find-epic-group-retreat-w-2-kitchens/HA-3215195985',
    platform: 'vrbo',
    sleeps: 13,
    distanceMi: 4,
    area: 'Pleasant Grove',
    note: 'Published from $528/nt. 6BR, two kitchens, pet friendly.',
  },
  {
    house: 'ranch',
    label: 'Orem Mountain View Estate',
    url: 'https://www.airbnb.com/rooms/1289837609259423770',
    platform: 'airbnb',
    sleeps: 20,
    distanceMi: 7,
    area: 'Orem',
    note: '6BR, 98-inch theater, covered hot tub. No published nightly found.',
  },

  // ---- River House: the Sundance / Provo Canyon group-lodge market ----
  {
    house: 'river',
    label: 'Stone Table Lodge · 2 Hot Tubs',
    url: 'https://www.airroi.com/airbnb-data/united-states/utah/sundance',
    platform: 'airbnb',
    sleeps: 16,
    distanceMi: 4,
    area: 'Sundance',
    note: 'AirROI: $1,215 daily rate, 52.2% occupancy, $216,899 revenue.',
  },
  {
    house: 'river',
    label: 'Massive Sundance Cabin · Sleeps 40+',
    url: 'https://www.airroi.com/airbnb-data/united-states/utah/sundance',
    platform: 'airbnb',
    sleeps: 40,
    distanceMi: 5,
    area: 'Sundance',
    note: 'AirROI: $3,658 daily rate, 25.2% occupancy, $311,902 revenue.',
  },

  // ---- Lindon House: the 4-bedroom family-home market ----
  {
    house: 'lindon',
    label: 'Pristine New Home · Hot Tub · Slps 18',
    url: 'https://www.hotala.com/property/pristine-new-home-w-hot-tub-4-bd-3-5-bth-slps-18/HA-3212789188',
    platform: 'vrbo',
    sleeps: 18,
    distanceMi: 4,
    area: 'Pleasant Grove',
    note: '4BR, 3.5 bath, hot tub, foosball.',
  },
  {
    house: 'lindon',
    label: '1 min Lindon Temple · Sleeps 16',
    url: 'https://www.airbnb.com/rooms/1426270095423990005',
    platform: 'airbnb',
    sleeps: 16,
    distanceMi: 1,
    area: 'Orem',
    note: '6BR on the Lindon border. The nearest 16-guest comp to the Lindon House.',
  },
  {
    house: 'lindon',
    label: 'Utah County Pool · Hot Tub · Game Rm',
    url: 'https://www.airbnb.com/rooms/1711253601665307078',
    platform: 'airbnb',
    sleeps: 16,
    distanceMi: 4,
    area: 'Vineyard',
    note: '5BR, private pool, hot tub, theater.',
  },
];

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

  const before = await fetch(`${BASE}/api/pricing/comp-set`, { headers: { Cookie: cookie } });
  const existing = (await before.json()).comps ?? [];
  // Re-running must not duplicate a comp. The URL is the identity.
  const seen = new Set(existing.map((comp) => comp.url));

  let saved = 0;
  let skipped = 0;
  for (const comp of COMPS) {
    if (seen.has(comp.url)) {
      console.log(`skip (already saved): ${comp.label}`);
      skipped += 1;
      continue;
    }
    const res = await fetch(`${BASE}/api/pricing/comp-set`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        platform: comp.platform,
        url: comp.url,
        label: comp.label,
        propertyId: comp.house,
        sleeps: comp.sleeps,
        distanceMi: comp.distanceMi,
        area: comp.area,
      }),
    });
    if (res.status !== 201) {
      console.error(`FAILED ${comp.label}: ${res.status} ${await res.text()}`);
      continue;
    }
    console.log(`saved ${comp.house}: ${comp.label} (sleeps ${comp.sleeps}, ${comp.distanceMi} mi)`);
    saved += 1;
  }

  const after = await fetch(`${BASE}/api/pricing/comp-set`, { headers: { Cookie: cookie } });
  const all = (await after.json()).comps ?? [];
  const byHouse = { ranch: 0, lindon: 0, river: 0, both: 0, none: 0 };
  for (const comp of all) byHouse[comp.propertyId ?? 'none'] += 1;
  console.log('');
  console.log(`saved ${saved}, skipped ${skipped}, total now ${all.length}`);
  console.log(
    `by house: ranch ${byHouse.ranch}, river ${byHouse.river}, lindon ${byHouse.lindon}, both ${byHouse.both}, no house ${byHouse.none}`,
  );
  if (byHouse.none > 0) {
    console.warn('WARNING: some comps have no house and set no band');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
