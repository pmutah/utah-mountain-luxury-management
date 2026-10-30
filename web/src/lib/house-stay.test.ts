import assert from 'node:assert/strict';
import test from 'node:test';
import { houseStay, partyFits } from './house-stay.ts';

test('the booking page uses the published house and refuses a party that does not fit', () => {
  const river = houseStay('river');
  assert.equal(river.sleeps, 25);
  assert.equal(river.checkIn, '4:00 PM');
  assert.match(river.bedrooms ?? '', /Seven king suites/);
  assert.equal(river.nearby.some((place) => place.name === 'Sundance Mountain Resort'), true);
  assert.deepEqual(
    river.notes.map((note) => note.title),
    ['Septic', 'The river'],
  );
  const ranch = houseStay('ranch');
  assert.equal(ranch.bedrooms, null);
  assert.match(ranch.parking, /driveway/);
  assert.equal(ranch.notes[0]?.title, 'Hot tub');
  const lindon = houseStay('lindon');
  assert.equal(lindon.nearby.some((place) => place.name === 'BYU campus'), true);
  assert.equal(lindon.notes.length, 0);
  const published = JSON.stringify({ river, ranch, lindon });
  assert.equal(/door code|wi-fi|password/i.test(published), false);

  assert.equal(partyFits('river', 25).ok, true);
  assert.equal(partyFits('river', 26).ok, false);
  assert.match(partyFits('river', 26).reason ?? '', /sleeps 25/);
  assert.equal(partyFits('lindon', 0).ok, false);
  assert.equal(partyFits('ranch', 1.5).ok, false);
});
