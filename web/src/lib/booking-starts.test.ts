import assert from 'node:assert/strict';
import test from 'node:test';
import { bookingStartSummary } from './booking-starts.ts';

test('weekend nights show two nights until they are inside 7 days', () => {
  const ranch = bookingStartSummary('ranch', [], '2026-10-29', 'short', 10);
  assert.match(ranch, /^Ranch: 2 weekend nights show 2 nights until they are inside 7 days\.$/);
  assert.equal(ranch.includes('Nov 4'), false);
  const soon = bookingStartSummary('ranch', [], '2026-11-01', 'short', 7);
  assert.equal(soon.includes('Nov 6'), false);
  assert.equal(soon.includes('$'), false);
});

test('a night that runs into a longer minimum starts at that minimum', () => {
  const river = bookingStartSummary('river', [], '2026-10-29', 'short', 30);
  assert.match(river, /Nov 23 starts at 4 nights/);
  assert.equal(river.includes('Nov 6'), false);
  const held = bookingStartSummary('river', ['2026-11-20'], '2026-10-29', 'unknown', 30);
  assert.match(held, /Nov 19 cannot start a stay/);
  assert.equal(held.includes('$'), false);
  const closedOnly = bookingStartSummary('lindon', [], '2026-10-29', 'unknown', 10, ['2026-11-04']);
  assert.equal(closedOnly.includes('Nov 4'), false);
});
