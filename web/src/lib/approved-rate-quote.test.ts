import assert from 'node:assert/strict';
import test from 'node:test';
import { directNight, quoteStay } from './quote.ts';
import { approvedGuestRate } from './market/rate-sheet.ts';
import { nightAsk } from './market/rates.ts';
import { AIRBNB_KEEP } from './revenue-goals.ts';

/*
 * The approved-rate sheet is the **only** path by which a comp-driven price reaches a guest:
 * `directNight` prefers an approved rate over the published card. Auto-pricing that never changes a
 * guest's price is not auto-pricing, so this path is pinned rather than assumed.
 *
 * Before this file the quote module had no coverage of `sheet` at all.
 */

const NIGHT = '2026-12-26';
const card = nightAsk('ranch', NIGHT).guest;

test('an approved night quotes the approved price, not the published card', () => {
  const withoutSheet = directNight('ranch', NIGHT, [], '2026-11-08', 'unknown');
  const withSheet = directNight('ranch', NIGHT, [], '2026-11-08', 'unknown', [{ date: NIGHT, guest: card + 60 }]);

  assert.equal(withoutSheet.guest, card, 'the published card is the baseline');
  assert.equal(withSheet.guest, card + 60, 'the approved price did not reach the guest');
  assert.equal(withSheet.approved, true);
});

test('an approved night takes no promotion, because the host set that price on purpose', () => {
  const night = directNight('ranch', NIGHT, [], '2026-11-08', 'behind', [{ date: NIGHT, guest: card + 60 }]);
  assert.equal(night.promotionPercent, 0, 'a fill promotion must not discount an approved price');
});

test('an approval on one night does not move any other night', () => {
  const sheet = [{ date: NIGHT, guest: card + 60 }];
  const other = directNight('ranch', '2027-01-09', [], '2026-11-08', 'unknown', sheet);
  assert.equal(other.guest, nightAsk('ranch', '2027-01-09').guest);
  assert.notEqual(other.approved, true);
});

test('a booked night keeps its rate even when a price was approved for it', () => {
  // The price is not the open question on a night that is already taken.
  const night = directNight('ranch', NIGHT, [NIGHT], '2026-11-08', 'unknown', [{ date: NIGHT, guest: card + 60 }]);
  assert.equal(night.guest, card);
  assert.notEqual(night.approved, true);
});

test('the approved price has to survive the same floor and cap the route enforces', () => {
  const ask = nightAsk('ranch', NIGHT);
  // At the card: accepted.
  assert.equal(approvedGuestRate([{ date: NIGHT, guest: ask.guest }], NIGHT, ask), ask.guest);
  // Above the 8% one-night cap: refused, so a stored row cannot smuggle a bad price past a guest.
  assert.equal(approvedGuestRate([{ date: NIGHT, guest: Math.round(ask.guest * 1.5) }], NIGHT, ask), null);
  // Under the floor: refused.
  assert.equal(approvedGuestRate([{ date: NIGHT, guest: ask.floorGuest - 1 }], NIGHT, ask), null);
});

test('a whole stay sums the approved night and the card on the others', () => {
  const approved = card + 60;
  const sheet = [{ date: NIGHT, guest: approved }];
  const stay = quoteStay('ranch', NIGHT, '2026-12-28', [], { asOf: '2026-11-08', pace: 'unknown', sheet });
  const first = stay.nights.find((n) => n.date === NIGHT);
  assert.equal(first?.guest, approved, 'the approved night is not in the stay total');

  /*
   * The stay total is on a host-net basis, while an approved rate is a guest price, so the total moves
   * by the guest difference less the platform keep — not by the full guest difference. That is the
   * documented behaviour, and pinning it here is what stops the two bases silently being mixed.
   */
  const plain = quoteStay('ranch', NIGHT, '2026-12-28', [], { asOf: '2026-11-08', pace: 'unknown' });
  const expected = directNight('ranch', NIGHT, [], '2026-11-08', 'unknown', sheet).direct
    - directNight('ranch', NIGHT, [], '2026-11-08', 'unknown').direct;
  assert.equal(stay.stayTotal - plain.stayTotal, expected, 'the stay total must move by the approved night');

  // And that movement is the guest difference less the platform keep, within rounding.
  const kept = (approved - card) * AIRBNB_KEEP;
  assert.ok(
    Math.abs(stay.stayTotal - plain.stayTotal - kept) <= 2,
    `a $${approved - card} guest raise adds about $${Math.round(kept)} of host net, not the full guest amount`,
  );
});
