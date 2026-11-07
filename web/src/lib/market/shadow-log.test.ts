import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SHADOW_LOG_KEY,
  SHADOW_UNREAD,
  hospitablePushAllowed,
  loadShadowLog,
  recordShadowDay,
  saveShadowLog,
  shadowClock,
  shadowClockLine,
} from './shadow-log.ts';

const DIGEST = 'UML shadow 2026-10-29\nRiver: 0 raises\nNothing sent to Hospitable.';

test('the same Denver day is saved once', () => {
  const once = recordShadowDay([], '2026-10-29', DIGEST);
  const twice = recordShadowDay(once, '2026-10-29', `${DIGEST}\nUpdated.`);
  assert.equal(twice.length, 1);
  assert.match(twice[0]!.digest, /Updated/);
  const clock = shadowClock(twice, '2026-10-29');
  assert.equal(clock.days, 1);
  assert.equal(clock.ready, false);
  assert.equal(hospitablePushAllowed(clock.ready, false), false);
  assert.match(shadowClockLine(clock), /Shadow day 1 of 7/);
  assert.match(shadowClockLine(clock), /6 more Denver days/);
});

test('seven recorded days still leave the write closed without a token', () => {
  let log = recordShadowDay([], '2026-10-23', DIGEST);
  for (let day = 24; day <= 29; day += 1) {
    log = recordShadowDay(log, `2026-10-${day}`, DIGEST);
  }
  const clock = shadowClock(log, '2026-10-29');
  assert.equal(clock.days, 7);
  assert.equal(clock.ready, true);
  assert.equal(hospitablePushAllowed(clock.ready, false), false);
  assert.equal(hospitablePushAllowed(clock.ready, true), true);
  assert.match(shadowClockLine(clock), /write token/);
});

test('a future day does not count and a sendable digest is dropped', () => {
  const kept = recordShadowDay(
    [
      { date: '2026-11-02', digest: DIGEST },
      { date: '2026-10-28', digest: 'Send this rate.' },
    ],
    '2026-10-29',
    'Missing the unsent line.',
  );
  assert.equal(kept.length, 1);
  assert.equal(kept[0]?.date, '2026-11-02');
  assert.deepEqual(shadowClock(kept, '2026-10-29').dates, []);
  const next = recordShadowDay(kept, '2026-10-29', DIGEST);
  assert.deepEqual(shadowClock(next, '2026-10-29').dates, ['2026-10-29']);
});

test('a day without the calendar does not count and drops that date', () => {
  const prior = recordShadowDay([], '2026-10-29', DIGEST);
  const unread = `${SHADOW_UNREAD}\nNothing sent to Hospitable.`;
  const next = recordShadowDay(prior, '2026-10-30', unread);
  assert.deepEqual(next.map((day) => day.date), ['2026-10-29']);
  const dropped = recordShadowDay(recordShadowDay(prior, '2026-10-30', DIGEST), '2026-10-30', unread);
  assert.deepEqual(dropped.map((day) => day.date), ['2026-10-29']);
  assert.equal(shadowClock(dropped, '2026-10-30').dates.includes('2026-10-30'), false);
});

test('a saved log round-trips and drops a broken row', () => {
  const store = new Map<string, string>();
  const memory = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  };
  saveShadowLog(recordShadowDay([], '2026-10-29', DIGEST), memory);
  store.set(
    SHADOW_LOG_KEY,
    JSON.stringify([
      { date: '2026-10-29', digest: DIGEST },
      { date: '2026-10-28', digest: 'nope' },
    ]),
  );
  const loaded = loadShadowLog(memory);
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0]?.date, '2026-10-29');
  assert.equal(loadShadowLog({ getItem: () => '{', setItem: () => undefined }).length, 0);
});
