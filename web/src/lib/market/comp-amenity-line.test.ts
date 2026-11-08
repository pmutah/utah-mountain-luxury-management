import assert from 'node:assert/strict';
import test from 'node:test';
import { compAmenityLine } from './amenities.ts';

/*
 * Every saved comp card reported "Sample list: none."
 *
 * `COMP_AMENITIES` is a hardcoded table keyed by **sample comp id** (`river-1`, `ranch-3`, …). A saved comp is
 * not in it, so the lookup missed and the card printed "Sample list: none." — a fabricated amenity comparison,
 * attached to a real listing, describing a list that comp was never in. It reads as a finding ("this competitor
 * has no amenities") when it is a table that does not know the id.
 *
 * Same shape as the rest of this stretch: a label with nothing behind it.
 */

test('a saved comp says its amenities were not saved rather than claiming none', () => {
  const line = compAmenityLine('airbnb-1812553268184581512', true);
  assert.equal(line.includes('Sample list'), false, 'a real comp was described as a sample');
  assert.match(line, /not saved/);
});

test('a sample comp still names its stand-in list, clearly labelled', () => {
  assert.match(compAmenityLine('river-1'), /^Sample list: /);
  assert.match(compAmenityLine('river-1'), /hot tub/);
  // A sample with an empty list still belongs to the sample set, so the noun is right.
  assert.equal(compAmenityLine('lindon-2'), 'Sample list: none.');
  // An id in neither set, reached as a sample, must not silently become a saved comp.
  assert.equal(compAmenityLine('unknown-id'), 'Sample list: none.');
});
