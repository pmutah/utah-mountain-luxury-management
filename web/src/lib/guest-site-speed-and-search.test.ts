import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { HOUSE_PHOTOS, houseGallery, photoSrcSet, PHOTO_VARIANT_WIDTHS } from './house-photos.ts';
import { houseExtraSchema, houseIndexSchema, publicHouse } from './house-page.ts';
import { findOpenWindows } from './open-dates-finder.ts';
import { addDays, weekdayIndex } from './market/dates.ts';
import { staticCacheControl } from '../../functions/_lib/static-cache.ts';
import type { HouseId } from './market/types.ts';

const HOUSES: HouseId[] = ['river', 'ranch', 'lindon'];
const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');

test('every guest photo has its WebP variants on disk, so a srcset never points at a missing file', () => {
  for (const house of HOUSES) {
    const sources = [...houseGallery(house).map((photo) => photo.src), HOUSE_PHOTOS[house]?.src ?? ''].filter(Boolean);
    for (const src of sources) {
      for (const width of PHOTO_VARIANT_WIDTHS) {
        const variant = join(process.cwd(), 'public', src.replace(/\.jpe?g$/i, `-${width}.webp`));
        assert.ok(existsSync(variant), `${variant} is missing — run node scripts/build-photo-variants.mjs`);
      }
    }
  }
});

test('photoSrcSet only describes house JPEGs and leaves every other image alone', () => {
  const set = photoSrcSet('/houses/river/exterior-01.jpg', '50vw');
  assert.equal(set.srcSet, '/houses/river/exterior-01-640.webp 640w, /houses/river/exterior-01-1280.webp 1280w');
  assert.equal(set.sizes, '50vw');
  assert.deepEqual(photoSrcSet('/api/expenses/1/photo'), {});
  assert.deepEqual(photoSrcSet('https://example.com/a.jpg'), {});
});

test('hashed assets are immutable, house photos keep for a week, and pages are never cached', () => {
  assert.equal(staticCacheControl('/assets/index-BXyz12ab.js'), 'public, max-age=31536000, immutable');
  assert.match(staticCacheControl('/houses/river/exterior-01-640.webp') ?? '', /max-age=604800/);
  assert.match(staticCacheControl('/houses/ranch.jpg') ?? '', /max-age=604800/);
  for (const page of ['/houses/', '/houses/river/', '/book/', '/llms.txt', '/sitemap.xml', '/stay/abc', '/index.html']) {
    assert.equal(staticCacheControl(page), null, page);
  }
  const middleware = read('functions', '_middleware.ts');
  assert.match(middleware, /staticCacheControl\(url\.pathname\)/);
  assert.match(middleware, /response\.status === 200/);
});

test('each house publishes eight-plus photos, a slashed canonical URL, a breadcrumb, and its FAQ to search', () => {
  for (const house of HOUSES) {
    const schema = publicHouse(house).schema;
    assert.equal(schema.url, `https://wilhite-portfolio.pages.dev/houses/${house}/`);
    const images = schema.image as string[];
    assert.ok(images.length >= 8, `${house} has ${images.length} schema images`);
    assert.ok(images.every((src) => src.startsWith('https://wilhite-portfolio.pages.dev/houses/')));
    assert.equal(new Set(images).size, images.length);
    const extra = houseExtraSchema(house);
    const types = extra.map((row) => row['@type']);
    assert.deepEqual(types, ['BreadcrumbList', 'FAQPage']);
    const text = JSON.stringify(extra);
    assert.equal(text.includes('$'), false);
    assert.equal(/door\s*code|wi-?fi|password|aggregateRating/i.test(text), false);
  }
  const index = houseIndexSchema();
  const list = index.find((row) => row['@type'] === 'ItemList') as { itemListElement: { url: string }[] };
  assert.deepEqual(
    list.itemListElement.map((row) => row.url.split('/houses/')[1]),
    ['river/', 'ranch/', 'lindon/'],
  );
  assert.match(read('src', 'components', 'HouseListing.tsx'), /houseExtraSchema\(house\.id\)/);
  assert.match(read('src', 'components', 'HouseSite.tsx'), /houseIndexSchema\(\)/);
});

const base = { asOf: '2026-12-01', pace: 'unknown' as const, taken: [] as string[], blocked: [] as string[] };

test('the open-dates finder offers stays the card can quote, at the asked length, around taken and held nights', () => {
  const open = findOpenWindows({ ...base, house: 'ranch', nights: 3, weekendsOnly: false });
  assert.ok(open.length > 0);
  for (const stay of open) {
    assert.ok(stay.nights >= 3);
    assert.equal(stay.checkOut, addDays(stay.checkIn, stay.nights));
    assert.equal(stay.stretched, stay.nights > 3);
    assert.equal(stay.label.includes('$'), false);
  }
  const first = open[0]!;
  const taken = [first.checkIn, addDays(first.checkIn, 1)];
  const blocked = [addDays(first.checkIn, 5)];
  const around = findOpenWindows({ ...base, house: 'ranch', nights: 3, weekendsOnly: false, taken, blocked });
  for (const stay of around) {
    for (let night = 0; night < stay.nights; night += 1) {
      const iso = addDays(stay.checkIn, night);
      assert.equal(taken.includes(iso) || blocked.includes(iso), false, `${iso} is not free`);
    }
  }
});

test('Friday arrivals are all Fridays, and a party the house cannot take gets no windows', () => {
  const fridays = findOpenWindows({ ...base, house: 'lindon', nights: 2, weekendsOnly: true });
  assert.ok(fridays.length > 0);
  assert.ok(fridays.every((stay) => weekdayIndex(stay.checkIn) === 5));
  assert.deepEqual(findOpenWindows({ ...base, house: 'lindon', nights: 2, weekendsOnly: false, guests: 40 }), []);
  const listing = read('src', 'components', 'HouseListing.tsx');
  assert.match(listing, /<OpenDatesFinder/);
  assert.match(listing, /chosenParts\.length === 0/);
  const finder = read('src', 'components', 'OpenDatesFinder.tsx');
  assert.equal(/\$\d|Book now|Instantly book|pay now/i.test(finder), false);
  assert.match(finder, /does not hold them/);
});
