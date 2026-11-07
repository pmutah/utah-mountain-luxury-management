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
  assert.match(ranch, /Quiet hours 10 PM to 8 AM/);
  assert.equal(ranch.includes('$'), false);
  assert.deepEqual(stayRhythm('lindon', '2026-11-08', '2026-11-06'), []);
});

test('quiet hours follow the published window and do not invent a river clock', () => {
  assert.match(quietNow('ranch', 23), /in effect until 8:00 AM/);
  assert.match(quietNow('lindon', 7), /in effect until 8:00 AM/);
  assert.match(quietNow('ranch', 8), /not in effect/);
  assert.match(quietNow('ranch', 13), /10:00 PM to 8:00 AM/);
  const river = quietNow('river', 23);
  assert.match(river, /does not name a clock/);
  assert.equal(river.includes('10'), false);
  const text = [quietNow('ranch', 23), quietNow('ranch', 13), river].join('\n');
  assert.equal(text.includes('$'), false);
  assert.equal(/\bthe house is open\b/i.test(text), false);
  const quote = quietNowLine('ranch', 23, 'quote');
  assert.match(quote, /in effect until 8:00 AM/);
  assert.match(quote, /does not say the house is open/);
  assert.match(quietNowLine('river', 23, 'quote'), /does not name a clock/);
  assert.equal(quietNowLine('ranch', 13, 'phone').includes('house is open'), false);
  assert.equal(quote.includes('$'), false);
});
