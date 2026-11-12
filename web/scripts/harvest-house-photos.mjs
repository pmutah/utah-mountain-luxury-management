/**
 * Download the real listing photos for the three houses into `public/houses/<house>/`.
 *
 * Why this exists: the public house pages shipped one photo each (`HOUSE_PHOTOS`), while the actual
 * listings carry 35–87 photos apiece. A direct-booking page with one image reads as thinner than an
 * Airbnb listing, which is exactly the comparison a guest makes. This copies the real sets onto our own
 * host so nothing on the guest site hotlinks a channel CDN.
 *
 * Sources, each verified to serve full-size images without a login:
 *   river  — our own Hospitable property page (utahmountainluxury.com). 1440x960 originals.
 *   ranch  — the Airbnb listing. `?im_w=1920` returns the large variant.
 *   lindon — the VRBO listing. The page renders in a real browser but refuses a plain fetch, so its
 *            URLs come from `scripts/house-photo-sources/lindon.txt`, captured from that page.
 *
 * Usage:
 *   node scripts/harvest-house-photos.mjs                 # all three houses
 *   node scripts/harvest-house-photos.mjs --house=ranch    # one house
 *   node scripts/harvest-house-photos.mjs --limit=24       # cap per house (default 28)
 *
 * It is idempotent: a photo already on disk is skipped unless `--force` is passed, and the manifest is
 * rewritten each run. Nothing outside `public/houses/` is touched, and the existing cover images
 * (`public/houses/<house>.jpg`) are never overwritten — OpenGraph tags and the dashboard postcards read them.
 */
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_ROOT = join(ROOT, 'public', 'houses');
const SOURCES = join(ROOT, 'scripts', 'house-photo-sources');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const has = (name) => args.includes(`--${name}`);
const LIMIT = Number(flag('limit') ?? 28);
const FORCE = has('force');
const ONLY = flag('house');

/** The page each house's photos come from, for the manifest and for a human re-running this. */
const LISTING = {
  river: 'https://utahmountainluxury.com/property/provo-riverhouse-6-king-beds-sleeps-24',
  ranch: 'https://www.airbnb.com/rooms/43263696',
  lindon: 'https://www.vrbo.com/4609228ha',
};

/**
 * The image URL as it should be saved, from the URL the page exposes.
 *
 * Each CDN has its own resize parameter and none of them accept the same one: Airbnb honors `im_w`, VRBO
 * honors `impolicy=resizecrop&rw=`, and Hospitable ignores query parameters entirely (its originals are
 * already 1440 wide, which is fine for a gallery). A bare URL is returned unchanged when nothing applies,
 * so an unknown host still downloads rather than silently producing a broken path.
 */
function saveUrl(house, url) {
  if (house === 'ranch' && url.includes('muscache.com')) {
    // 1920 is the largest variant that answers 200; 1600 is a 404 on this CDN.
    return `${url}?im_w=1920`;
  }
  if (house === 'lindon' && url.includes('media.vrbo.com')) {
    // 3840x2880 originals are ~1.4 MB each. 1600x1200 at ~400 KB is plenty for a full-screen gallery.
    return `${url}?impolicy=resizecrop&rw=1600&ra=fit`;
  }
  return url;
}

/** A stable file name from the URL, so re-running does not reshuffle the gallery. */
function fileName(index, url) {
  const tail = url.split('/').pop()?.split('?')[0] ?? 'photo.jpg';
  const base = tail.replace(/\.[a-z]+$/i, '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || `photo-${index}`;
  return `${String(index + 1).padStart(2, '0')}-${base}.jpg`;
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' } });
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  return res.text();
}

async function fetchBuffer(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  const type = res.headers.get('content-type') ?? '';
  if (!type.startsWith('image/')) throw new Error(`${url} answered ${type || 'no content type'}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Unique absolute image URLs of one shape, in the order the page lists them (order matters: the first is usually the cover). */
function collect(html, pattern) {
  const seen = new Set();
  const out = [];
  for (const match of html.matchAll(pattern)) {
    const url = match[0].replace(/\\u002F/g, '/');
    if (seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

async function riverUrls() {
  const html = await fetchText(LISTING.river);
  // Hospitable property pages list each photo as a bare asset URL, cover first.
  return collect(html, /https:\/\/assets\.hospitable\.com\/property_images\/[^"'\\ )]+/g);
}

async function ranchUrls() {
  const html = await fetchText(LISTING.ranch);
  return collect(html, /https:\/\/a0\.muscache\.com\/im\/pictures\/[^"'\\ ?]+\.(?:jpg|jpeg|webp)/g);
}

async function lindonUrls() {
  // Captured from the listing page in a browser session, because that page refuses a plain fetch.
  const text = await readFile(join(SOURCES, 'lindon.txt'), 'utf8');
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

const RESOLVE = { river: riverUrls, ranch: ranchUrls, lindon: lindonUrls };

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function harvestHouse(house) {
  const urls = (await RESOLVE[house]()).slice(0, LIMIT);
  const dir = join(OUT_ROOT, house);
  await mkdir(dir, { recursive: true });
  const manifest = [];
  let saved = 0;
  let skipped = 0;
  let failed = 0;
  for (const [index, url] of urls.entries()) {
    const name = fileName(index, url);
    const path = join(dir, name);
    const src = saveUrl(house, url);
    if (!FORCE && (await exists(path))) {
      manifest.push({ file: name, source: url });
      skipped += 1;
      continue;
    }
    try {
      const bytes = await fetchBuffer(src);
      await writeFile(path, bytes);
      manifest.push({ file: name, source: url });
      saved += 1;
      console.log(`  saved ${house}/${name} (${Math.round(bytes.length / 1024)} KB)`);
    } catch (err) {
      failed += 1;
      console.error(`  FAILED ${house}/${name}: ${err instanceof Error ? err.message : err}`);
    }
  }
  await writeFile(
    join(dir, 'manifest.json'),
    `${JSON.stringify({ house, listing: LISTING[house], capturedAt: new Date().toISOString(), photos: manifest }, null, 2)}\n`,
  );
  return { house, saved, skipped, failed, total: manifest.length };
}

const houses = ONLY ? [ONLY] : ['river', 'ranch', 'lindon'];
for (const house of houses) {
  if (!RESOLVE[house]) {
    console.error(`unknown house ${house}`);
    process.exit(1);
  }
  console.log(`\n${house} — ${LISTING[house]}`);
  const out = await harvestHouse(house);
  console.log(`${out.house}: ${out.total} photos (${out.saved} downloaded, ${out.skipped} already there, ${out.failed} failed)`);
}
