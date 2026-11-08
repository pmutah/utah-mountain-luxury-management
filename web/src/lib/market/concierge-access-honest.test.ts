import assert from 'node:assert/strict';
import test from 'node:test';
import { conciergeAccessLine } from '../stay-rules.ts';

/*
 * **Nora promised a Wi-Fi password the house does not have.**
 *
 * Asked for the password on a real Lindon stay, the guest concierge answered: "The Wi-Fi password will appear on
 * your phone after you read the house rules and open each stay-agreement topic." Only the **River House** has Wi-Fi
 * saved in its guide; Ranch and Lindon have none. So the guest would work through the whole checklist and find an
 * empty field.
 *
 * The gate itself is right — a concierge must never hand out a code, and this one didn't. What was wrong is that
 * `conciergeAccessLine` told Nora, unconditionally, that both the door code and the Wi-Fi "appear" after the rules.
 * A model told a fact will state it. The fix is to give it the fact that is true for *this* house.
 *
 * The rule I am pinning: when the guide does not hold something, Nora says so and offers a person. "Go look" is not
 * an answer, and inventing one is worse.
 */

const WHEN = '2026-11-18';

test('a house with neither says so, and never points at a field that is empty', () => {
  const line = conciergeAccessLine(WHEN, { doorCode: false, wifi: false });
  assert.match(line, /Neither a door code nor Wi-Fi details are saved/i);
  assert.match(line, /never invent/i);
  // The failure mode: telling the guest to go read the rules for something that is not there.
  assert.equal(/appear on \d{4}-\d{2}-\d{2} after the house rules/.test(line), false);
});

test('a house with a door code but no Wi-Fi offers a person for the Wi-Fi', () => {
  const line = conciergeAccessLine(WHEN, { doorCode: true, wifi: false });
  assert.match(line, /door code stays on the guest phone/i, 'the door-code gate was lost');
  assert.match(line, /no Wi-Fi name or password saved/i, 'the missing Wi-Fi was not named');
  assert.match(line, /offer to have it sent/i, 'the guest was not offered a real next step');
  assert.equal(/Wi-Fi .{0,40}appear/i.test(line), false, 'still promises a Wi-Fi password that does not exist');
});

test('a house with Wi-Fi but no door code offers a person for the door', () => {
  const line = conciergeAccessLine(WHEN, { doorCode: false, wifi: true });
  assert.match(line, /no door code saved/i);
  assert.match(line, /person will confirm/i);
});

test('a house with both keeps the gate exactly as it was', () => {
  const line = conciergeAccessLine(WHEN, { doorCode: true, wifi: true });
  assert.match(line, /stay on the guest phone/i);
  assert.match(line, new RegExp(`appear on ${WHEN}`));
  assert.match(line, /Do not invent a code/i);
});

test('the gate never leaks a code or a price, whatever it is told', () => {
  // The belt-and-braces refusal at the end of the function, which predates this change and must survive it.
  for (const has of [
    { doorCode: true, wifi: true },
    { doorCode: true, wifi: false },
    { doorCode: false, wifi: true },
    { doorCode: false, wifi: false },
  ]) {
    const line = conciergeAccessLine(WHEN, has);
    assert.equal(line.includes('$'), false, 'a price reached a guest concierge');
    assert.equal(/code\s*\d/.test(line), false, 'a digit code reached the concierge');
  }
});

test('a caller that passes no facts keeps the old, permissive line', () => {
  /*
   * The default is unchanged on purpose: an existing caller that does not know about the new argument must not
   * suddenly be told its house has no Wi-Fi. Guessing "missing" would be as wrong as guessing "present".
   */
  const line = conciergeAccessLine(WHEN);
  assert.match(line, /door code and Wi-Fi stay on the guest phone/i);
});

