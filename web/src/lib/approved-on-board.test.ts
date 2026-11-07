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
  const ask = nightAsk(HOUSE, DATE);
  const approved = ask.guest + Math.round(ask.guest * MAX_DAILY_MOVE);

  const before = pushPlanAll(
    [runShadow(buildMarketBoard(HOUSE, TODAY, 60), [], false, TODAY, 'short', [])],
    GATE,
  )[0]!;
  const stale = before.nights.find((n) => n.date === DATE);
  assert.equal(stale?.from, ask.guest, 'the un-approved plan should start from the card');

  const after = pushPlanAll(
    [
      runShadow(
        buildMarketBoard(HOUSE, TODAY, 60, undefined, null, [{ date: DATE, guest: approved }]),
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
  if (now) {
    assert.equal(now.from, approved, 'the plan does not start from the approved price');
    // A further raise is still allowed: the cap is per day, measured from the approved price.
    assert.ok(
      now.to - approved <= Math.round(approved * MAX_DAILY_MOVE),
      'the next step exceeded the daily cap measured from the approved price',
    );
  }
  // Whatever it does, it must not re-propose the raise that is already in force.
  assert.equal(
    now?.from === ask.guest && now?.to === approved,
    false,
    'the plan re-proposed the raise the host already approved',
  );
});
