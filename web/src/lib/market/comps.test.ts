import assert from 'node:assert/strict';
import test from 'node:test';
import { chooseComps, fairCompView, sortCompCards } from './comps.ts';
import { compsFor } from './fixtures.ts';

test('an untouched set is the original ten comps', () => {
  const chosen = chooseComps('river', { pinned: [], excluded: [] });
  assert.deepEqual(
    chosen.map((comp) => comp.id),
    compsFor('river').map((comp) => comp.id),
  );
});

test('hiding a comp brings in the next bench home and keeps ten', () => {
  const chosen = chooseComps('river', { pinned: [], excluded: ['river-1'] });
  assert.equal(chosen.length, 10);
  assert.equal(chosen.some((comp) => comp.id === 'river-1'), false);
  assert.equal(chosen.some((comp) => comp.id === 'river-b1'), true);
});

test('sorting sample comps keeps a pin first and does not drop one', () => {
  const cards = compsFor('river').map((comp) => ({
    id: comp.id,
    distanceMi: comp.distanceMi,
    rating: comp.rating,
    sleeps: comp.sleeps,
    reviews: comp.reviews,
  }));
  const closest = sortCompCards(cards, [], 'distance');
  assert.equal(closest[0]?.distanceMi, Math.min(...cards.map((card) => card.distanceMi)));
  const rated = sortCompCards(cards, ['river-10'], 'rating');
  assert.equal(rated[0]?.id, 'river-10');
  assert.equal(rated.length, cards.length);
  assert.equal(new Set(rated.map((card) => card.id)).size, cards.length);
});

test('fair only keeps close samples and leaves the rate band alone', () => {
  const cards = [
    { id: 'a', fit: 'close' as const },
    { id: 'b', fit: 'small' as const },
    { id: 'c', fit: 'far' as const },
  ];
  const view = fairCompView(cards, true);
  assert.deepEqual(
    view.cards.map((card) => card.id),
    ['a'],
  );
  assert.match(view.note, /1 of 3/);
  assert.match(view.note, /does not change the rate band/);
  assert.equal(view.note.includes('$'), false);
  assert.equal(fairCompView(cards, false).note, '');
  assert.equal(fairCompView(cards, false).cards.length, 3);
  const none = fairCompView([{ id: 'b', fit: 'small' as const }], true);
  assert.equal(none.cards.length, 1);
  assert.match(none.note, /full list stays/);
});

test('a pinned comp stays first', () => {
  const chosen = chooseComps('river', { pinned: ['river-10'], excluded: [] });
  assert.equal(chosen[0]?.id, 'river-10');
  assert.equal(chosen.length, 10);
});
