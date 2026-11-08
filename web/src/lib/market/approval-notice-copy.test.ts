import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { directNight } from '../quote.ts';
import { nightAsk } from './rates.ts';
import { AIRBNB_KEEP } from '../revenue-goals.ts';

/*
 * The approve button promised a number the booking page does not charge.
 *
 * The panel said "Approved $193 for 2026-12-09. **That night now quotes this price on our own page.**" The page
 * quoted **$163**. The 15.5% difference is not a bug — `/book` takes no platform fee and charges the host net, so
 * the direct guest keeps the fee as a discount, and `approved-rate-quote.test.ts` already pins that arithmetic.
 *
 * I briefly "fixed" the quote instead and broke two tests that documented the design. The price was right; the
 * promise was wrong. That is the distinction this file holds: the arithmetic is asserted elsewhere, and here the
 * *wording* is checked, because the wording is what misled the host.
 */

const NIGHT = '2026-12-09';
const panel = readFileSync(new URL('../../components/PushPlanPanel.tsx', import.meta.url), 'utf8');

test('an approved rate is a channel price and /book charges the host net', () => {
  /*
   * The invariant the panel now has to describe accurately. If this ever changes, the copy below is wrong too and
   * this test should fail first.
   */
  const approved = 193;
  const night = directNight('lindon', NIGHT, [], '2026-11-08', 'short', [{ date: NIGHT, guest: approved }]);
  assert.equal(night.guest, approved, 'the approved rate is the channel guest price');
  assert.equal(night.direct, Math.round(approved * AIRBNB_KEEP), '/book no longer charges the host net');
  assert.ok(night.direct < approved, 'a direct guest should pay less than the channel price');
  // And the card path agrees, so this is the house rule and not a special case for approvals.
  const card = directNight('lindon', '2026-12-06', [], '2026-11-08', 'short');
  assert.equal(card.direct, Math.round(nightAsk('lindon', '2026-12-06').guest * AIRBNB_KEEP));
});

test('the approval notice names both prices rather than promising one', () => {
  assert.match(panel, /AIRBNB_KEEP/, 'the notice does not compute the direct price it names');
  assert.match(panel, /our own page quotes the host net/, 'the notice no longer says which price the page charges');
  assert.equal(
    /now quotes this price on our own page/.test(panel),
    false,
    'the notice went back to promising the approved price on our own page',
  );
});

test('the approve button carries the same warning', () => {
  /*
   * The label above the buttons said the same wrong thing, and a host reads that before clicking. Both places have
   * to agree with the page, not just the one that fires after the click.
   */
  assert.match(panel, /Approve a night to set that Airbnb price/);
  assert.match(panel, /a direct guest\s+saves the platform fee/, 'the button lost the direct-price explanation');
  assert.equal(/Approve a night to quote that price on our own page/.test(panel), false);
});


