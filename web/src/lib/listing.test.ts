import assert from 'node:assert/strict';
import test from 'node:test';
import { LISTING_TITLE, listingOpenLine, listingOpportunities } from './listing.ts';

test('the booking titles name the sleep count and the best feature', () => {
  assert.match(LISTING_TITLE.river, /Sleeps 24/);
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
  assert.equal(river.find((item) => item.id === 'addons')?.status, 'ready');
  assert.match(river.find((item) => item.id === 'addons')?.detail ?? '', /Canyon grocery drop/);
  assert.match(listingOpportunities('ranch').find((item) => item.id === 'addons')?.detail ?? '', /Hot tub ready at arrival/);
  assert.equal((listingOpportunities('lindon').find((item) => item.id === 'addons')?.detail ?? '').includes('Hot tub'), false);
  assert.equal(river.find((item) => item.id === 'agreement')?.status, 'ready');
  assert.match(river.find((item) => item.id === 'agreement')?.detail ?? '', /does not sign/);
  const text = JSON.stringify(river);
  assert.equal(text.includes('$'), false);
  assert.equal(listingOpportunities('ranch').find((item) => item.id === 'photos')?.detail.includes('rendering'), false);
  const open = listingOpenLine();
  assert.match(open, /River still uses a rendering/);
  assert.match(open, /Ranch has one photo/);
  assert.match(open, /Lindon has one photo/);
  assert.match(open, /Direct booking still emails a request/);
  assert.match(open, /Nothing is posted to Airbnb or VRBO/);
  assert.equal(open.includes('$'), false);
});

test('the open lines no longer claim the page holds nothing', () => {
  // The hold landed, so "does not hold the dates" became false. A host reading this card should not
  // be told the page holds nothing when a request actually holds for 30 minutes.
  const payment = listingOpportunities('river').find((item) => item.id === 'payment');
  assert.equal(payment?.detail.includes('hold the dates'), false, 'a stale no-hold claim came back');
  assert.match(payment?.detail ?? '', /holds the dates for 30 minutes/);
  assert.match(payment?.detail ?? '', /does not charge a card/);
});
