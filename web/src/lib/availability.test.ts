import assert from 'node:assert/strict';
import test from 'node:test';
import { blockedRequestHouse, housesForRequest, occupiedByHouse, occupiedNights } from './availability.ts';

test('cancelled stays free the nights and a block keeps them', () => {
  const nights = occupiedNights(
    [
      { propertyId: 'ranch', checkIn: '2026-11-02', checkOut: '2026-11-05', status: 'cancelled' },
      { propertyId: 'ranch', checkIn: '2026-11-10', checkOut: '2026-11-12', status: 'blocked' },
      { propertyId: 'lindon', checkIn: '2026-11-02', checkOut: '2026-11-04' },
    ],
    'ranch',
    '2026-11-01',
    '2026-12-01',
  );
  assert.deepEqual(nights, ['2026-11-10', '2026-11-11']);
});

test('the window stops at check-out and ignores other houses', () => {
  const byHouse = occupiedByHouse(
    [{ propertyId: 'river', checkIn: '2026-12-10', checkOut: '2026-12-13' }],
    '2026-12-01',
    '2027-01-01',
  );
  assert.deepEqual(byHouse.river, ['2026-12-10', '2026-12-11', '2026-12-12']);
  assert.deepEqual(byHouse.ranch, []);
});

test('a two-house request stays blocked when either house already has the nights', () => {
  const stays = [{ propertyId: 'ranch', checkIn: '2026-11-13', checkOut: '2026-11-15', status: 'confirmed' }];
  assert.deepEqual(housesForRequest('river', 'ranch'), ['river', 'ranch']);
  assert.deepEqual(housesForRequest('river', 'river'), ['river']);
  assert.deepEqual(housesForRequest('river', ''), ['river']);
  assert.equal(blockedRequestHouse(stays, ['river', 'ranch'], '2026-11-13', '2026-11-15'), 'ranch');
  assert.equal(blockedRequestHouse(stays, ['river'], '2026-11-13', '2026-11-15'), null);
  assert.equal(blockedRequestHouse(stays, ['river', 'ranch'], '2026-11-15', '2026-11-17'), null);
});
