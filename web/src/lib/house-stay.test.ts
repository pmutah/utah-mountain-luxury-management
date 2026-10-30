import assert from 'node:assert/strict';
import test from 'node:test';
import { houseStay, partyFits } from './house-stay.ts';

test('the booking page uses the published house and refuses a party that does not fit', () => {
  const river = houseStay('river');
  assert.equal(river.sleeps, 25);
  assert.equal(river.checkIn, '4:00 PM');
  assert.match(river.bedrooms ?? '', /Seven king suites/);
  assert.equal(river.nearby.some((place) => place.name === 'Sundance Mountain Resort'), true);
  assert.equal(houseStay('ranch').bedrooms, null);
  assert.match(houseStay('ranch').parking, /driveway/);
  assert.equal(houseStay('lindon').nearby.some((place) => place.name === 'BYU campus'), true);

  assert.equal(partyFits('river', 25).ok, true);
  assert.equal(partyFits('river', 26).ok, false);
  assert.match(partyFits('river', 26).reason ?? '', /sleeps 25/);
  assert.equal(partyFits('lindon', 0).ok, false);
  assert.equal(partyFits('ranch', 1.5).ok, false);
});
