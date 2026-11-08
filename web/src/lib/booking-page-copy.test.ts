import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

/*
 * The booking page's opening copy has been wrong in both directions, so it is now pinned.
 *
 * It first said *"This is a preview of our own booking page… Live direct booking still runs on the
 * Hospitable site."* That understates the product: a request really does save, hold the nights for thirty
 * minutes, email the team, and return the guest a status link. A guest reading "preview" would reasonably
 * close the tab and book elsewhere.
 *
 * The registry marks this pillar `sample`, which is deliberate — direct booking is a trial, not the live
 * channel. So the honest sentence has to say both things: this works, and it is being trialled. Rewriting
 * it to claim a full booking site would be the opposite error, and worse, because it would be a promise the
 * product does not keep.
 */

const source = readFileSync(join(process.cwd(), 'src', 'components', 'DirectBook.tsx'), 'utf8');

/** The opening paragraph only, so a rule cannot be satisfied by text elsewhere on a very long page. */
function openingCopy(): string {
  const start = source.indexOf('Stay with us');
  assert.ok(start > 0, 'the booking page no longer has its opening heading');
  return source.slice(start, start + 1400);
}

test('the booking page does not call itself a preview, because a request really does save and hold', () => {
  const copy = openingCopy();
  assert.doesNotMatch(copy, /This is a preview/i, 'the page again tells a guest it is only a preview');
  assert.doesNotMatch(
    copy,
    /Live direct booking still runs on the Hospitable site/i,
    'the page again says booking only happens elsewhere',
  );
});

test('the booking page says it is a trial and points a guest at the listings', () => {
  const copy = openingCopy();
  assert.match(copy, /trialled|trial/i, 'the page does not say direct requests are a trial');
  assert.match(copy, /Airbnb|VRBO/i, 'the page does not point a guest at the channels that are live');
});

test('the booking page never claims a card will be charged', () => {
  const copy = openingCopy();
  assert.match(copy, /does not charge a card/i, 'the page no longer says a card is not charged');
  // A sentence promising a charge would be the most expensive kind of wrong.
  assert.doesNotMatch(copy, /we will charge|card will be charged|pay now/i);
});
