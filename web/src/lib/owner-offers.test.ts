import assert from 'node:assert/strict';
import test from 'node:test';
import { ownerOfferLines } from './owner-offers.ts';

test('Todd sees Ranch and River quote choices with no price', () => {
  const lines = ownerOfferLines([], '2026-10-29', []);
  assert.equal(lines.map((line) => line.id).join(','), 'ranch,river');
  assert.match(lines[1]?.text ?? '', /River Nov 1 can quote 2, 3, 4, 7, 14, 28 nights/);
  assert.match(lines[1]?.text ?? '', /can request an early arrival, a later checkout, and a grocery drop/);
  assert.match(lines[0]?.text ?? '', /Ranch Oct 29 can request a later checkout/);
  assert.equal(lines.some((line) => line.text.includes('Lindon') || line.text.includes('$')), false);
  const held = ownerOfferLines([], '2026-10-29', [{ propertyId: 'river', start: '2026-11-01', end: '2026-11-03' }]);
  assert.match(held[1]?.text ?? '', /River Nov 3 can quote 2, 3, 4, 7, 14, 28 nights/);
  assert.equal(held[1]?.text.includes('early arrival'), false);
});
