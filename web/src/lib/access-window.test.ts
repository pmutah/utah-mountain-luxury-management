import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { accessWindow } from '../../functions/_lib/guest-guide.ts';

/*
 * The door code opens the day before check-in and closes at noon on checkout day, Denver time. Two ways to get this
 * wrong, and both hurt a real guest:
 *
 *   - an off-by-one that opens it a day early, or leaves it live after the stay;
 *   - an off-by-one in the other direction that strands someone arriving at midnight.
 *
 * And a third, which I found by asking what a late guest sees: the code closes an hour after the 11:00 AM checkout guests
 * are given, so a guest still collecting their bags loses it. That buffer is fine; being thanked and given nothing else is
 * not.
 *
 * Denver is UTC-7 in December (MST).
 */

const IN = '2026-12-10';
const OUT = '2026-12-13';
const at = (iso: string) => accessWindow(IN, OUT, new Date(iso));

test('the code stays shut until midnight Denver on the day before', () => {
  assert.equal(at('2026-12-09T06:59:00Z').open, false, '11:59pm the night before opened the code');
  assert.equal(at('2026-12-09T06:59:00Z').phase, 'before');
  assert.equal(at('2026-12-09T07:00:00Z').open, true, 'midnight the day before did not open the code');
});

test('the code stays open through check-in and the stay', () => {
  assert.equal(at('2026-12-10T18:00:00Z').open, true, 'check-in day was shut');
  assert.equal(at('2026-12-12T18:00:00Z').open, true, 'a mid-stay day was shut');
});

test('the code stays open until noon on checkout day, and no later', () => {
  // 11:00 AM Denver: the checkout time guests are given.
  assert.equal(at('2026-12-13T18:00:00Z').open, true, 'the code closed before the checkout time');
  // Noon Denver: the buffer ends.
  assert.equal(at('2026-12-13T19:00:00Z').open, false, 'the code was still open at noon');
  assert.equal(at('2026-12-13T19:00:00Z').phase, 'after');
});

test('a closed window says why and who to call', () => {
  /*
   * What a guest still at the house at 12:01 sees. "Thank you for staying" alone leaves them locked out with no next step.
   * The sentences wrap in the JSX source, so the check runs on whitespace-collapsed text.
   */
  const page = readFileSync(new URL('../components/StayApp.tsx', import.meta.url), 'utf8').replace(/\s+/g, ' ');
  assert.match(page, /stay-door-closed/, 'the closed state has no message of its own');
  assert.match(page, /The door code closed at noon on your checkout day/, 'the closed state does not say why');
  assert.match(page, /call us and we will open it for you/, 'the closed state offers no way to get in');
});

test('the checkout time guests are told still leaves the noon buffer', () => {
  // If checkout ever moves past noon, the buffer becomes a lockout and this test is the place that shows up.
  const stay = readFileSync(new URL('./house-stay.ts', import.meta.url), 'utf8');
  const times = [...stay.matchAll(/checkOut: '([^']+)'/g)].map((m) => m[1]);
  assert.ok(times.length > 0, 'no checkout time is published');
  for (const time of times) {
    const hour = Number(time.split(':')[0]);
    const pm = /PM/i.test(time);
    const h24 = pm && hour !== 12 ? hour + 12 : hour;
    assert.ok(h24 <= 12, `checkout time ${time} is after the noon code cutoff`);
  }
});
