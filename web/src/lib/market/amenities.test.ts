import assert from 'node:assert/strict';
import test from 'node:test';
import { amenityGapsForChoice, compAmenityLine } from './amenities.ts';

test('sample comps show amenity gaps without a price or a live claim', () => {
  const river = amenityGapsForChoice('river');
  const ev = river.find((row) => row.id === 'ev-charger');
  const ours = river.find((row) => row.id === 'river');
  assert.equal(ev?.ours, false);
  assert.equal(ev?.listed, 9);
  assert.equal(ev?.compared, 10);
  assert.match(ev?.line ?? '', /9 of 10 sample comps list an EV charger. Our guide does not./);
  assert.equal(ours?.ours, true);
  assert.match(ours?.line ?? '', /We list the river/);
  assert.equal(river.some((row) => row.line.includes('$')), false);
  assert.equal(river.some((row) => /live listing/i.test(row.line)), false);

  const hidden = amenityGapsForChoice('river', ['river-1']);
  assert.equal(hidden.find((row) => row.id === 'ev-charger')?.listed, 8);

  const ranch = amenityGapsForChoice('ranch');
  const tub = ranch.find((row) => row.id === 'hot-tub');
  assert.equal(tub?.ours, true);
  assert.equal(tub?.listed, 8);
  assert.match(compAmenityLine('ranch-6'), /a hot tub/);
  assert.match(compAmenityLine('lindon-2'), /none/);

  const lindon = amenityGapsForChoice('lindon');
  assert.equal(lindon.every((row) => row.ours === false), true);
  assert.equal(lindon.some((row) => row.id === 'hot-tub'), true);
});
