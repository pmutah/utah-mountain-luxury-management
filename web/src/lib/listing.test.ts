import assert from 'node:assert/strict';
import test from 'node:test';
import { LISTING_TITLE, listingOpportunities } from './listing.ts';

test('the booking titles name the sleep count and the best feature', () => {
  assert.match(LISTING_TITLE.river, /Sleeps 25/);
  assert.match(LISTING_TITLE.river, /7 King Suites/);
  assert.match(LISTING_TITLE.ranch, /Hot Tub/);
  assert.match(LISTING_TITLE.lindon, /near BYU/);
});

test('photos and card payment stay open, and the title is already on our page', () => {
  const river = listingOpportunities('river');
  assert.equal(river.find((item) => item.id === 'title')?.status, 'ready');
  assert.equal(river.find((item) => item.id === 'photos')?.status, 'open');
  assert.match(river.find((item) => item.id === 'photos')?.detail ?? '', /rendering/);
  assert.equal(river.find((item) => item.id === 'payment')?.status, 'open');
  assert.equal(river.find((item) => item.id === 'weekend')?.status, 'ready');
  assert.equal(listingOpportunities('ranch').find((item) => item.id === 'photos')?.detail.includes('rendering'), false);
});
