import assert from 'node:assert/strict';
import test from 'node:test';
import { GROUP_TRIP, parseHousePath, publicHouse, publicHouses } from './house-page.ts';

test('each public house page uses the published guide and leaves prices and door codes off', () => {
  const houses = publicHouses();
  assert.deepEqual(
    houses.map((house) => house.id),
    ['river', 'ranch', 'lindon'],
  );
  for (const house of houses) {
    const text = JSON.stringify(house);
    assert.match(house.facts.join(' '), new RegExp(`Sleeps ${house.sleeps}`));
    assert.match(text, /4:00 PM/);
    assert.match(text, /11:00 AM/);
    assert.equal(text.includes('$'), false);
    assert.equal(/door\s*code|wi-?fi|password/i.test(text), false);
    assert.equal(house.schema['@type'], 'VacationRental');
    assert.equal(JSON.stringify(house.schema).includes('aggregateRating'), false);
    assert.equal(house.quoteHref, `/book?house=${house.id}`);
  }
  const river = publicHouse('river');
  assert.match(river.photo.caption, /rendering/);
  assert.match(river.opening ?? '', /November 1, 2026/);
  assert.match(river.address, /Vivian Park/);
  assert.equal((river.schema.address as { postalCode: string }).postalCode, '84604');
  const ranch = publicHouse('ranch');
  assert.match(ranch.notes.map((note) => note.title).join(' '), /Hot tub/);
  assert.match(ranch.address, /270 East Center Street/);
  assert.equal(GROUP_TRIP.includes('$'), false);
  assert.match(GROUP_TRIP, /does not hold either house/);
});

test('the public paths are only the index and the three houses', () => {
  assert.equal(parseHousePath('/houses'), 'index');
  assert.equal(parseHousePath('/houses/'), 'index');
  assert.equal(parseHousePath('/houses/river'), 'river');
  assert.equal(parseHousePath('/houses/ranch/'), 'ranch');
  assert.equal(parseHousePath('/houses/lindon'), 'lindon');
  assert.equal(parseHousePath('/houses/construction'), null);
  assert.equal(parseHousePath('/book'), null);
});
