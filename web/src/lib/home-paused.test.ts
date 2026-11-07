import assert from 'node:assert/strict';
import test from 'node:test';
import { homePausedLines, housePausedLines } from './home-paused.ts';

test('the home desk names the next event and the rate rules', () => {
  const text = homePausedLines('2026-10-30').join('\n');
  assert.match(text, /No night is raised or promoted/);
  assert.match(text, /Nothing was written over them/);
  assert.match(text, /direct request stays off/);
  assert.match(text, /does not ask for a name/);
  assert.match(text, /Nothing is sent/);
  assert.match(text, /BYU vs Arizona State/);
  assert.match(text, /The River House is not on an event that ends before November 1/);
  assert.match(text, /Nothing extra is added/);
  assert.match(text, /at or above the floor/);
  assert.match(text, /inside 8%/);
  assert.match(text, /Nothing is posted/);
  assert.equal(text.includes('$'), false);
  assert.equal(text.includes('raises'), false);
  const afternoon = homePausedLines('2026-10-30', 13).join('\n');
  assert.match(afternoon, /Ranch and Lindon: Quiet hours are not in effect/);
  assert.match(afternoon, /does not name a clock/);
  const night = homePausedLines('2026-10-30', 23).join('\n');
  assert.match(night, /in effect until 8:00 AM/);
  assert.equal(afternoon.includes('$') || night.includes('$'), false);
});

test('a house tab keeps that house’s rules when the bookings cannot be read', () => {
  const river = housePausedLines('river', '2026-10-30').join('\n');
  const ranch = housePausedLines('ranch', '2026-10-30').join('\n');
  const lindon = housePausedLines('lindon', '2026-10-30').join('\n');
  assert.match(river, /at least 2 nights/);
  assert.match(river, /Canyon grocery drop/);
  assert.match(ranch, /A weekday can be 1 night/);
  assert.match(ranch, /Hot tub ready at arrival/);
  assert.equal(lindon.includes('Hot tub'), false);
  assert.match(river, /BYU at Utah/);
  assert.match(river, /2 nights/);
  assert.equal(river.includes('Arizona State'), false);
  assert.match(ranch, /BYU vs Arizona State/);
  assert.match(ranch, /1 night/);
  assert.match(river, /Nothing is posted/);
  const text = `${river}\n${ranch}\n${lindon}`;
  assert.equal(text.includes('$'), false);
  assert.equal(/\bopen\b/i.test(text), false);
  assert.match(housePausedLines('river', '2026-10-30', 23).join('\n'), /does not name a clock/);
  assert.equal(housePausedLines('river', '2026-10-30', 23).join('\n').includes('10:00 PM'), false);
  assert.match(housePausedLines('ranch', '2026-10-30', 23).join('\n'), /in effect until 8:00 AM/);
});
