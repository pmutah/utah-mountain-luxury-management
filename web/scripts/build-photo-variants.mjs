/**
 * Write the smaller WebP copies the guest pages actually download.
 *
 * Every JPEG under `public/houses/` gets `<name>-640.webp` and `<name>-1280.webp` beside it. The gallery and the
 * house cards read them through `photoSrcSet()` in `src/lib/house-photos.ts`, and the JPEG stays as the fallback
 * and the OpenGraph image, because some link scrapers still refuse WebP.
 *
 * A variant is only rewritten when its JPEG is newer, so re-running after one new photo touches one file.
 * `photo-variants.test.ts` fails the build when a gallery photo has no variant on disk.
 *
 * `sharp` is not a direct dependency: it arrives with `wrangler`, which every checkout already has, so the script
 * never asks anyone to install an image library to add a photo.
 *
 *   npm run photos:variants
 *   node scripts/build-photo-variants.mjs --force
 */
import { readdir, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HOUSES = join(ROOT, 'public', 'houses');
const WIDTHS = [640, 1280];
const FORCE = process.argv.includes('--force');

async function jpegs(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await jpegs(path)));
    else if (/\.jpe?g$/i.test(entry.name)) out.push(path);
  }
  return out;
}

async function mtime(path) {
  try {
    return (await stat(path)).mtimeMs;
  } catch {
    return 0;
  }
}

let wrote = 0;
let before = 0;
let after = 0;
for (const file of await jpegs(HOUSES)) {
  const source = await stat(file);
  for (const width of WIDTHS) {
    const target = file.replace(/\.jpe?g$/i, `-${width}.webp`);
    if (!FORCE && (await mtime(target)) >= source.mtimeMs) continue;
    await sharp(file).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 74, effort: 5 }).toFile(target);
    wrote += 1;
    if (width === 1280) {
      before += source.size;
      after += (await stat(target)).size;
    }
  }
}
const kb = (bytes) => `${Math.round(bytes / 1024)} KB`;
console.log(wrote === 0 ? 'Photo variants are current.' : `Wrote ${wrote} variants. 1280w: ${kb(before)} of JPEG became ${kb(after)} of WebP.`);
