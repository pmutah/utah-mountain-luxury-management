/**
 * The cleaner gets the door code, inside the window and never outside it.
 *
 * The code was withheld from the cleaner link on the reasoning that she should not hold the lock. The owner overruled that on
 * 2026-11-10 — Hospitable puts it in the cleaning task note, and the cleaner is the one person who has to get inside. Money
 * stays off her page.
 *
 * The window is what makes it safe rather than merely convenient: a code appears only from the day before the checkout, which
 * is the same rule the guest phone follows, so a link read weeks early shows the job and nothing to open a door with.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanJobView, cleanerDoorWindowOpen } from './clean-link.ts';
import { doorCodesForStay } from './part-door-codes.ts';

const TODAY = '2026-11-10';

test('a job carries the code once the window is open, and none before it', () => {
  /*
   * The phase rule, exercised through the same helper the route uses. `accessWindow` is keyed to the checkout morning, so a
   * turn on the day before or the day of carries a code and one a fortnight out does not.
   */
  const codes = [{ label: 'Door code', code: '4821' }];

  const far = cleanJobView({ house: 'ranch', checkout: '2026-11-24', gapNights: 1, door: null });
  assert.ok(far, 'the far job did not build');
  assert.equal(far!.door, null, 'a code reached a clean two weeks before the checkout');

  const near = cleanJobView({ house: 'ranch', checkout: TODAY, gapNights: 0, door: codes });
  assert.ok(near);
  assert.deepEqual(near!.door, [{ label: 'Door code', code: '4821' }], 'an open window did not carry the code');
});

test('money stays off the cleaner page', () => {
  /*
   * The other half of the owner's answer: show the code, never the pay. A `$` on this page is the defect that keeps coming
   * back, so it is asserted directly.
   */
  const job = cleanJobView({
    house: 'ranch',
    checkout: TODAY,
    gapNights: 0,
    door: [{ label: 'Door code', code: '4821' }],
  });
  assert.ok(job);
  assert.equal(JSON.stringify(job).includes('$'), false, 'a price reached the cleaner page');
  assert.equal(/\bpay\b|\bpayout\b|\bpaid\b/i.test(JSON.stringify(job)), false, 'pay reached the cleaner page');
});

test('a part turn gets the codes for the parts it covers, not the house', () => {
  /*
   * The same rule as the guest page: the house code opens every part, so a turn scoped to the Garage Suite must not carry it.
   */
  const plan = doorCodesForStay({
    house: 'river',
    units: ['garage-suite'],
    houseCode: '1111',
    partCodes: { 'garage-suite': '2222', 'main-lodge': '4444' },
  });
  const job = cleanJobView({ house: 'river', checkout: TODAY, gapNights: 0, units: ['garage-suite'], door: plan.codes });
  assert.ok(job);
  assert.deepEqual(job!.door, [{ label: 'River Garage Suite', code: '2222' }]);
  assert.equal(JSON.stringify(job).includes('1111'), false, 'the house code reached a part-only turn');
  assert.equal(JSON.stringify(job).includes('4444'), false, 'another part code reached a part-only turn');
});

test('a house with no code set shows the job and no door line', () => {
  const job = cleanJobView({ house: 'lindon', checkout: TODAY, gapNights: 2, door: null });
  assert.ok(job);
  assert.equal(job!.door, null);
  // The job is still usable: the steps and the arrival line are there.
  assert.ok(job!.steps.length > 0);
  assert.match(job!.arrive, /Park|driveway/i);
});

test('an empty door list is null, not an empty array a page might render', () => {
  const job = cleanJobView({ house: 'ranch', checkout: TODAY, gapNights: 0, door: [] });
  assert.ok(job);
  assert.equal(job!.door, null);
});

test('the cleaner keeps the code past noon on the turn day', () => {
  /*
   * This is why the route does not use the guest phone's rule directly. `accessWindow` closes at **noon** on checkout day,
   * because that is when a guest must be out. A cleaner starts at 11 AM and works into the afternoon — using that rule would
   * take the code away mid-turn, which is worse than not showing it at all because she would have relied on it.
   *
   * The route compares the **day**, through `cleanerDoorWindowOpen` — the same function it calls, not a copy of it.
   */
  assert.equal(cleanerDoorWindowOpen('2026-11-12', '2026-11-14'), false, 'a day too early carried the code');
  assert.equal(cleanerDoorWindowOpen('2026-11-13', '2026-11-14'), true, 'the day before the checkout was refused');
  assert.equal(cleanerDoorWindowOpen('2026-11-14', '2026-11-14'), true, 'the turn day was refused');
  assert.equal(cleanerDoorWindowOpen('2026-11-15', '2026-11-14'), false, 'the day after still carried the code');
});

test('the prose rule about door codes is still filtered, because that is a different thing', () => {
  /*
   * `rules` drops any house-rule line that mentions a door code — that filter was written when the field did not exist, and it
   * still earns its place: a note saying "the door code is 1234" would now duplicate the real code in prose, outside the window
   * the field obeys.
   */
  const job = cleanJobView({ house: 'ranch', checkout: TODAY, gapNights: 0, door: null });
  assert.ok(job);
  assert.equal(job!.rules.some((line) => /door\s*code/i.test(line)), false, 'a door code line survived in the rules prose');
});
