/**
 * Pick the photos that go on the guest site, name them for what they show, and drop the rest.
 *
 * The harvest pulls everything a listing publishes, and a listing publishes more than a booking page
 * should show. River's set, for example, carries Booking.com-watermarked duplicates and construction-stage
 * interiors; Ranch and Lindon carry a few reference shots (framed art, a laundry closet) that say nothing
 * about the stay. This is the editorial pass between "downloaded" and "on the site".
 *
 * It renames each keeper to `<category>-<nn>.jpg` so the file name states what the picture is, deletes
 * every other JPEG in that house's folder, and rewrites `manifest.json` with the final names, the source
 * URL each came from, and its caption. Re-running is safe: it resolves the current names through the
 * manifest first, so a second pass does not lose the mapping.
 *
 *   node scripts/curate-house-photos.mjs
 *   node scripts/curate-house-photos.mjs --house=river
 *
 * Captions are guest-facing. No caption may name a price, a door code, Wi-Fi, or our own build state —
 * `house-photos-copy.test.ts` enforces that once they reach `house-photos.ts`.
 */
import { readFile, writeFile, readdir, rename, unlink } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HOUSES = join(ROOT, 'public', 'houses');

/**
 * Per house: the photos to keep, in the order the gallery shows them.
 *
 * `src` is the harvest's leading index (`01`, `02`, …), which the manifest resolves to a file. `name` is
 * the final file name; the leading word is the gallery category and drives the filter chips.
 */
const KEEP = {
  ranch: [
    { src: '01', name: 'outdoors-01', caption: 'Hot tub under the pergola at night' },
    { src: '02', name: 'outdoors-02', caption: 'The lit hot tub and fire pit after dark' },
    { src: '09', name: 'living-01', caption: 'Living room with a brick fireplace and leather seating' },
    { src: '10', name: 'living-02', caption: 'Leather sectional against the reclaimed-wood wall' },
    { src: '18', name: 'kitchen-01', caption: 'The kitchen, open to the dining room' },
    { src: '19', name: 'kitchen-02', caption: 'Kitchen with stainless appliances and a wide island' },
    { src: '20', name: 'kitchen-03', caption: 'Dining for a full house under the round chandelier' },
    { src: '21', name: 'bedrooms-01', caption: 'Bright bedroom with a king bed' },
    { src: '22', name: 'bedrooms-02', caption: 'King bedroom with three bird prints' },
    { src: '23', name: 'bedrooms-03', caption: 'King bedroom with blue walls and white wainscoting' },
    { src: '26', name: 'bedrooms-04', caption: 'King bedroom with a mountain mural' },
    { src: '24', name: 'bedrooms-05', caption: 'Bunk room with two twin bunks' },
    { src: '27', name: 'bedrooms-06', caption: 'Bedroom with two twin beds' },
    { src: '28', name: 'bedrooms-07', caption: 'Bunk beds and twins in the second bunk room' },
    { src: '15', name: 'amenities-01', caption: 'Pool table in the game room' },
    { src: '12', name: 'amenities-02', caption: 'Theater seating and a bar' },
    { src: '07', name: 'amenities-03', caption: 'Stand-up arcade' },
    { src: '13', name: 'amenities-04', caption: 'The arcade and the bar' },
    { src: '05', name: 'outdoors-03', caption: 'The fenced yard, garden beds, and pergola' },
    { src: '06', name: 'outdoors-04', caption: 'Fire pit seating on the patio' },
  ],
  lindon: [
    { src: '01', name: 'living-01', caption: 'Living room with a floor-to-ceiling stone fireplace' },
    { src: '02', name: 'living-02', caption: 'Sectional seating for the whole family' },
    { src: '03', name: 'living-03', caption: 'The living room opens to the kitchen' },
    { src: '04', name: 'kitchen-01', caption: 'Kitchen with white counters and gray cabinets' },
    { src: '05', name: 'kitchen-02', caption: 'Dining table for six' },
    { src: '07', name: 'bedrooms-01', caption: 'Bedroom with a wall-mounted air conditioner' },
    { src: '08', name: 'baths-01', caption: 'Bath with a double vanity' },
    { src: '06', name: 'exterior-01', caption: 'Brick entry and covered front porch' },
    { src: '09', name: 'outdoors-01', caption: 'Private balcony with bistro seating' },
    { src: '10', name: 'outdoors-02', caption: 'The Lindon Aquatics Center across the street' },
    { src: '12', name: 'outdoors-03', caption: 'Utah Lake is minutes away' },
  ],
  river: [
    { src: '01', name: 'exterior-01', caption: 'Architectural rendering of the front of the house' },
    { src: '02', name: 'exterior-02', caption: 'Architectural rendering of the drive and garage' },
    { src: '03', name: 'kitchen-01', caption: 'Architectural rendering of the kitchen and island' },
    { src: '07', name: 'amenities-01', caption: 'Architectural rendering of the heated game garage' },
    { src: '06', name: 'outdoors-01', caption: 'Barrel sauna and hot tub' },
    { src: '12', name: 'exterior-03', caption: 'The house from across the Provo River' },
    { src: '10', name: 'outdoors-02', caption: 'The footbridge over the Provo River' },
    { src: '11', name: 'outdoors-03', caption: 'Fall color along the river' },
  ],
};

/** The two level drawings River publishes. They belong on the floorplan tab, not in the photo gallery. */
const FLOORPLANS = {
  river: [
    { src: '04', name: 'floorplan-main', title: 'Main level' },
    { src: '05', name: 'floorplan-upper', title: 'Upper level' },
  ],
};

const flag = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const ONLY = flag('house');

async function loadManifest(house) {
  try {
    return JSON.parse(await readFile(join(HOUSES, house, 'manifest.json'), 'utf8'));
  } catch {
    return null;
  }
}

/**
 * The harvested file for an item, whether the manifest still holds it or it was already renamed by an
 * earlier run. Curation runs more than once — a photo can be dropped after review — so this resolves
 * through the final name first, then the harvest index.
 */
async function resolveSource(house, item) {
  const dir = join(HOUSES, house);
  const files = await readdir(dir);
  const manifest = await loadManifest(house);
  const everyRow = [...(manifest?.photos ?? []), ...(manifest?.floorplans ?? [])];
  const atFinal = (name) => {
    if (!files.includes(`${name}.jpg`)) return null;
    const row = everyRow.find((entry) => entry.file === `${name}.jpg`);
    return { file: `${name}.jpg`, source: row?.source ?? '' };
  };
  const named = atFinal(item.name);
  if (named) return named;
  const fromManifest = everyRow.find((row) => row.file.startsWith(`${item.src}-`));
  if (fromManifest && files.includes(fromManifest.file)) return fromManifest;
  const onDisk = files.find((file) => file.startsWith(`${item.src}-`) && file.endsWith('.jpg'));
  return onDisk ? { file: onDisk, source: everyRow.find((row) => row.file === onDisk)?.source ?? '' } : null;
}

async function curate(house) {
  const dir = join(HOUSES, house);
  const keep = KEEP[house] ?? [];
  const plans = FLOORPLANS[house] ?? [];
  if (keep.length === 0) {
    console.log(`${house}: nothing curated, skipped`);
    return;
  }
  const final = new Map();
  const rows = [];
  for (const item of keep) {
    const found = await resolveSource(house, item);
    if (!found) {
      console.error(`  ${house}: no harvested photo ${item.src} for ${item.name}`);
      continue;
    }
    final.set(found.file, `${item.name}.jpg`);
    rows.push({ file: `${item.name}.jpg`, source: found.source, caption: item.caption });
  }
  const planRows = [];
  for (const item of plans) {
    const found = await resolveSource(house, item);
    if (!found) {
      console.error(`  ${house}: no harvested drawing ${item.src} for ${item.name}`);
      continue;
    }
    final.set(found.file, `${item.name}.jpg`);
    planRows.push({ file: `${item.name}.jpg`, source: found.source, title: item.title });
  }

  // Rename first, so a re-run resolves through the same names, then remove whatever was not kept.
  for (const [from, to] of final) {
    if (from === to) continue;
    try {
      await rename(join(dir, from), join(dir, to));
    } catch (err) {
      // Already renamed by an earlier run: the final name is what we wanted anyway.
      if (err?.code !== 'ENOENT') throw err;
    }
  }
  const keptNames = new Set(final.values());
  let removed = 0;
  for (const file of await readdir(dir)) {
    if (!file.endsWith('.jpg')) continue;
    if (keptNames.has(file)) continue;
    await unlink(join(dir, file));
    removed += 1;
  }
  const manifest = await loadManifest(house);
  await writeFile(
    join(dir, 'manifest.json'),
    `${JSON.stringify(
      { house, listing: manifest?.listing ?? null, capturedAt: manifest?.capturedAt ?? null, curatedAt: new Date().toISOString(), photos: rows, floorplans: planRows },
      null,
      2,
    )}\n`,
  );
  console.log(`${house}: kept ${rows.length} photos${planRows.length ? ` + ${planRows.length} floorplans` : ''}, removed ${removed}`);
}

for (const house of ONLY ? [ONLY] : Object.keys(KEEP)) {
  await curate(house);
}
