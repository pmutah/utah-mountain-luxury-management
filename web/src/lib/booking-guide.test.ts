import assert from 'node:assert/strict';
import test from 'node:test';
import { bookingGuide } from './booking-guide.ts';

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
  assert.equal(bookingGuide('ranch', '2026-11-04', '2026-11-05').nearby.length, 19);
});
