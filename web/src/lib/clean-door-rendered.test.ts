/**
 * The cleaner page draws the door code, and still draws no money.
 *
 * The route has sent a `door` field since 2026-11-10 and `CleanLink.tsx` never read it — so the API was right, the tests were
 * right, and the cleaner still stood at a locked door. A field with nothing behind it is the defect this whole build keeps
 * returning to, and a source-level guard is the only thing that catches the "sent but never drawn" shape.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const PAGE = readFileSync('src/components/CleanLink.tsx', 'utf8');

test('the cleaner page renders the door code', () => {
  assert.match(PAGE, /job\.door/, 'the page never reads the door field the route sends');
  assert.match(PAGE, /data-bot="clean-link-door"/, 'there is no element for the code to render into');
  // The code itself, set apart so it is readable at a glance on a phone.
  assert.match(PAGE, /font-mono/, 'the code is not visually set apart');
});

test('the page labels the code in both languages', () => {
  // A Spanish cleaner must be told what the number is, not just shown it.
  assert.match(PAGE, /door: 'Door code'/);
  assert.match(PAGE, /door: 'Código de la puerta'/);
});

test('money is still not on the cleaner page', () => {
  /*
   * The owner's answer was explicit: show the code, never the pay. This looks for a **rendered currency amount** — a `$`
   * followed by a digit — rather than any `$`, because `${…}` is JS syntax and my first version of this test failed on template
   * literals that had nothing to do with money.
   */
  const code = PAGE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.equal(/\$\s?\d/.test(code), false, 'a price appears in the cleaner page source');
  assert.equal(/formatCurrency|formatWhole|toFixed\(2\)/.test(code), false, 'the cleaner page formats money');
  assert.equal(/\bpayout\b|\bpayRate\b|\bearnings\b/i.test(code), false, 'a pay field appears in the cleaner page source');
});

test('the page does not name a guest', () => {
  // It shows the house and the day, never who stayed.
  const code = PAGE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.equal(/guestName|customerName/i.test(code), false, 'the cleaner page reads a guest name');
});

test('a job with no code draws nothing rather than an empty box', () => {
  // Outside the window the field is null, so the block must be conditional on it.
  assert.match(PAGE, /job\.door && job\.door\.length > 0/, 'the door block is not guarded, so an empty box can render');
});
