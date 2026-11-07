import assert from 'node:assert/strict';
import test from 'node:test';
import { ownerAgreementLines, ownerCheckoutLine, ownerRules, ownerTurnLine } from './owner-rules.ts';

test('Todd’s rules name the split and leave the ledger off', () => {
  const lines = ownerRules();
  const text = lines.join('\n');
  assert.match(text, /20% management fee to Brandon first/);
  assert.match(text, /Todd takes one half/);
  assert.match(text, /Brandon and Stephanie take the other half/);
  assert.match(text, /A loss after the fee splits the same way/);
  assert.match(text, /hot tub request at the Ranch House/);
  assert.match(text, /grocery drop at the River House follow that same split/);
  assert.match(text, /does not say that anyone asked/);
  assert.match(text, /early arrival and a later checkout on Ranch or River/);
  assert.match(text, /wait until the calendar can be read/);
  assert.match(text, /Lindon is Brandon/);
  assert.match(text, /construction bills are not on this page/);
  assert.match(text, /does not change a booking or a saved expense/);
  assert.match(text, /at or above the floor/);
  assert.match(text, /inside 8%/);
  assert.match(text, /Nothing is posted/);
  assert.equal(text.includes('$'), false);
  assert.equal(/\b\d{3,}\b/.test(text), false);
});

test('Todd’s card names the stay agreement and does not sign it', () => {
  const text = ownerAgreementLines().join('\n');
  assert.match(text, /Ranch covers the hot tub/);
  assert.match(text, /River covers the river and the septic/);
  assert.match(text, /Lindon is not on this page/);
  assert.match(text, /provided as-is/);
  assert.match(text, /does not cancel the stay unless the host agrees in writing/);
  assert.match(text, /does not insure belongings, vehicles, or cash/);
  assert.match(text, /does not sign the agreement/);
  assert.match(text, /does not change a booking|changes a booking/);
  assert.equal(text.includes('$'), false);
  assert.equal(/door\s*code|wi-?fi|password/i.test(text), false);
});

test('Todd’s card names the same-day clean and leaves Lindon off', () => {
  const line = ownerTurnLine();
  assert.match(line, /Ranch and River/);
  assert.match(line, /5 hours, from 11:00 AM to 4:00 PM/);
  assert.match(line, /1:00 PM arrival makes it 2 hours/);
  assert.match(line, /2:00 PM leave before a 4:00 PM arrival makes it 2 hours/);
  assert.match(line, /does not say that anyone asked/);
  assert.match(line, /Lindon is not on this page/);
  assert.match(line, /Nothing was booked or sent/);
  assert.equal(line.includes('$'), false);
  assert.equal(/door\s*code|wi-?fi|password/i.test(line), false);
});

test('Todd’s card lists Ranch and River checkouts and leaves Lindon off', () => {
  const line = ownerCheckoutLine([
    { house: 'lindon', checkOut: '2026-11-08' },
    { house: 'ranch', checkOut: '2026-11-10' },
    { house: 'river', checkOut: '2026-11-12' },
  ]);
  assert.match(line, /Next Ranch and River checkouts: The Ranch House Nov 10, The River House Nov 12/);
  assert.equal(line.includes('Lindon House'), false);
  assert.match(line, /not the statement/);
  assert.match(line, /Names stay off this list/);
  assert.equal(line.includes('$'), false);
  assert.equal(line.includes('Hidden Guest'), false);
  const none = ownerCheckoutLine([]);
  assert.match(none, /No Ranch or River checkout/);
  const unread = ownerCheckoutLine(null);
  assert.match(unread, /could not be read/);
});
