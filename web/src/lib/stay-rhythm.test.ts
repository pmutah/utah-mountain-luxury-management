import assert from 'node:assert/strict';
import test from 'node:test';
import { quietNow, quietNowLine, stayRhythm } from './stay-rhythm.ts';

test('a River quote names the house rhythm without a price or a code', () => {
  const lines = stayRhythm('river', '2026-11-06', '2026-11-08');
  const text = lines.map((line) => line.text).join('\n');
  assert.match(text, /Arrive November 6, 2026 at 4:00 PM/);
  assert.match(text, /Leave November 8, 2026 at 11:00 AM/);
  assert.match(text, /The door code stays off this page/);
  assert.equal(text.includes('November 5, 2026'), false);
  assert.equal(/day before/i.test(text), false);
  assert.match(text, /Quiet hours in this mountain neighborhood/);
  assert.match(text, /BYU at Utah/);
  assert.match(text, /does not hold the dates or charge a card/);
  assert.equal(text.includes('$'), false);
  assert.equal(/password|code\s*\d/i.test(text), false);
  assert.equal(text.includes('10 PM'), false);
});

test('Ranch uses the published quiet hours and skips a backwards stay', () => {
  const ranch = stayRhythm('ranch', '2026-11-06', '2026-11-08').map((line) => line.text).join('\n');
  assert.match(ranch, /Quiet hours 10 PM to 6 AM/);
  assert.equal(ranch.includes('$'), false);
  assert.deepEqual(stayRhythm('lindon', '2026-11-08', '2026-11-06'), []);
});

test('quiet hours follow the published window at every house', () => {
  /*
   * The River House used to be the exception: the guide named no clock there, so this test asserted the line carried no
   * number rather than inventing one. The owner gave 10 PM to 6 AM for all three houses on 2026-11-10, so the River now has a
   * real window and this asserts the same rule everywhere — and still asserts that nothing is invented when it is unknown.
   */
  assert.match(quietNow('ranch', 23), /in effect until 6:00 AM/);
  // 5 AM is inside the window; 7 AM is after it ends at 6.
  assert.match(quietNow('lindon', 5), /in effect until 6:00 AM/);
  assert.match(quietNow('lindon', 7), /not in effect/);
  assert.match(quietNow('ranch', 8), /not in effect/);
  assert.match(quietNow('ranch', 13), /10:00 PM to 6:00 AM/);
  // The River House is no longer a special case.
  assert.match(quietNow('river', 23), /in effect until 6:00 AM/);
  assert.match(quietNow('river', 13), /10:00 PM to 6:00 AM/);
  // 6 AM is the end: quiet hours are over at 06:00, not still running.
  assert.match(quietNow('river', 6), /not in effect/);
  const text = [quietNow('ranch', 23), quietNow('ranch', 13), quietNow('river', 23)].join('\n');
  assert.equal(text.includes('$'), false);
  assert.equal(/\bthe house is open\b/i.test(text), false);
  const quote = quietNowLine('ranch', 23, 'quote');
  assert.match(quote, /in effect until 6:00 AM/);
  assert.match(quote, /does not say the house is open/);
  assert.match(quietNowLine('river', 23, 'quote'), /quiet hours are in effect/i);
  assert.equal(quietNowLine('ranch', 13, 'phone').includes('house is open'), false);
  assert.equal(quote.includes('$'), false);
});
