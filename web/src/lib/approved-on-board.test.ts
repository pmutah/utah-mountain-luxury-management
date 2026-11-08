import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMarketBoard } from './market/board.ts';
import { runShadow } from './market/shadow.ts';
import { pushPlanAll } from './market/push.ts';
import { nightAsk } from './market/rates.ts';
import { MAX_DAILY_MOVE } from './market/rate-sheet.ts';

const GATE = { shadowReady: true, hasToken: true, paused: false, calendarReady: true };
const TODAY = '2026-11-07';
const HOUSE = 'river' as const;
// Inside a 30-day window from TODAY, so the 30-day board actually contains it.
const DATE = '2026-11-21';

test('the board starts from an approved night, not the published card', () => {
  /*
   * The push plan and the market overview both rebuild from `buildMarketBoard`, which read only the
   * published card. A night the host approved was therefore invisible to them, so the plan kept
   * proposing a raise the host had already made: 2219 -> 2397 on a night already at 2397.
   */
  const ask = nightAsk(HOUSE, DATE);
  const approved = ask.guest + Math.round(ask.guest * MAX_DAILY_MOVE);

  const plain = buildMarketBoard(HOUSE, TODAY, 30);
  assert.equal(plain.nights.find((n) => n.date === DATE)?.ourGuest, ask.guest);

  const withSheet = buildMarketBoard(HOUSE, TODAY, 30, undefined, null, [{ date: DATE, guest: approved }]);
  assert.equal(
    withSheet.nights.find((n) => n.date === DATE)?.ourGuest,
    approved,
    'the board did not start from the approved price',
  );
});

test('a night with no approval keeps the published card', () => {
  const ask = nightAsk(HOUSE, DATE);
  const approved = ask.guest + Math.round(ask.guest * MAX_DAILY_MOVE);
  const board = buildMarketBoard(HOUSE, TODAY, 30, undefined, null, [{ date: DATE, guest: approved }]);
  const others = board.nights.filter((n) => n.date !== DATE);
  assert.ok(others.length > 20);
  for (const night of others) {
    assert.equal(night.ourGuest, nightAsk(HOUSE, night.date).guest, `${night.date} moved without an approval`);
  }
});

test('the push plan starts from the approved price rather than the card', () => {
  /*
   * The point of this test is that an approval the host already made is not re-proposed. It used to run on the
   * sample band, where a raise on every open night was guaranteed; that band no longer moves a rate. So the
   * board here carries three saved asks **above** the approved price, which is the situation the rule is for: a
   * measured market that still wants to go higher, stepped from what the host actually published.
   */
  const comp = (id: string) => ({
    id,
    name: id,
    area: 'Sundance',
    beds: 6,
    sleeps: 16,
    rating: 4.9,
    reviews: 10,
    guestFavorite: true,
    distanceMi: 0.4,
    isOwn: false,
    minNights: 1,
  });
  const asks = new Map([
    ['m1', new Map([[DATE, 2600]])],
    ['m2', new Map([[DATE, 2700]])],
    ['m3', new Map([[DATE, 2800]])],
  ]);
  const live = { comps: [comp('m1'), comp('m2'), comp('m3')], index: asks };

  const ask = nightAsk(HOUSE, DATE);
  const approved = ask.guest + Math.round(ask.guest * MAX_DAILY_MOVE);
  assert.ok(approved > ask.guest, 'the fixture must approve a price above the card');

  const after = pushPlanAll(
    [
      runShadow(
        buildMarketBoard(HOUSE, TODAY, 60, undefined, live, [{ date: DATE, guest: approved }]),
        [],
        false,
        TODAY,
        'short',
        [],
      ),
    ],
    GATE,
  )[0]!;
  const now = after.nights.find((n) => n.date === DATE);
  assert.ok(now, 'a measured night above the approved price should still be planned');
  assert.equal(now.from, approved, 'the plan does not start from the approved price');
  // A further raise is still allowed: the cap is per day, measured from the approved price.
  assert.ok(
    now.to - approved <= Math.round(approved * MAX_DAILY_MOVE),
    'the next step exceeded the daily cap measured from the approved price',
  );
  // Whatever it does, it must not re-propose the raise that is already in force.
  assert.equal(
    now.from === ask.guest && now.to === approved,
    false,
    'the plan re-proposed the raise the host already approved',
  );
});

test('an approved price on a night with no saved comp still does not move', () => {
  /*
   * The other side of the same rule, and the reason it is safe to hold sample nights: approving a price is a
   * host decision about *our* rate, not a measurement of the market. It changes where the board starts from, and
   * it does not license the engine to step again off invented comps.
   */
  const ask = nightAsk(HOUSE, DATE);
  const approved = ask.guest + Math.round(ask.guest * MAX_DAILY_MOVE);
  const plan = pushPlanAll(
    [runShadow(buildMarketBoard(HOUSE, TODAY, 60, undefined, null, [{ date: DATE, guest: approved }]), [], false, TODAY, 'short', [])],
    GATE,
  )[0]!;
  assert.equal(plan.nights.find((n) => n.date === DATE), undefined, 'an approved sample night was stepped again');
});
