import assert from 'node:assert/strict';
import test from 'node:test';
import { bookingGuide, quotePaper } from './booking-guide.ts';
import { quoteStay } from './quote.ts';

test('the printed house guide leaves the door code off the paper', () => {
  const guide = bookingGuide('river', '2026-11-06', '2026-11-08');
  const text = JSON.stringify(guide);
  assert.equal(guide.name, 'The River House');
  assert.equal(guide.checkout[0], 'Start the dishwasher.');
  assert.match(text, /sundanceresort\.com/);
  assert.match(text, /Dates on this quote: 2026-11-06 to 2026-11-08/);
  assert.match(guide.close, /does not hold the dates/);
  assert.match(text, /The door code stays off this paper/);
  assert.equal(/password/i.test(text), false);
  assert.equal(guide.nearby[0], 'Ski');
  assert.equal(bookingGuide('ranch', '2026-11-04', '2026-11-05').nearby.includes('Before you go'), true);
  const quote = quoteStay('ranch', '2026-11-04', '2026-11-05', [], {
    asOf: '2026-10-30',
    pace: 'short',
    guests: 4,
    children: 1,
  });
  const paper = quotePaper({
    ok: quote.ok,
    reason: quote.reason,
    nights: quote.nights.length,
    lodging: quote.lodging,
    cleaning: quote.cleaning,
    stayTotal: quote.stayTotal,
    party: 'Overnight guests 4, including 1 child.',
    arrival: 'Arrival around 6:00 PM.',
    departure: 'Leave at 11:00 AM.',
  });
  assert.equal(quote.ok, true);
  assert.match(paper[0] ?? '', /before tax for 1 night/);
  assert.match(paper.join(' '), /1 child/);
  assert.match(paper.join(' '), /6:00 PM/);
  assert.match(paper.join(' '), /Leave at 11:00 AM/);
  assert.match(paper.at(-1) ?? '', /does not hold the dates or charge a card/);
  assert.equal(paper.join(' ').includes('Ada'), false);
  const refused = quotePaper({
    ok: false,
    reason: 'A stay needs an adult.',
    nights: 1,
    lodging: quote.lodging,
    cleaning: quote.cleaning,
    stayTotal: quote.stayTotal,
    party: 'Overnight guests 4, including 4 children.',
    arrival: '',
  });
  assert.equal(refused.join(' ').includes('$'), false);
  assert.match(refused[0] ?? '', /adult/);
});
