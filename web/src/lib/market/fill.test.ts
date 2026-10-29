import assert from 'node:assert/strict';
import test from 'node:test';
import { promotionForNight, weekWeekend } from './fill.ts';

const open = {
  ourGuest: 1000,
  floorGuest: 400,
  taken: new Set<string>(),
  pace: 'short' as const,
};

test('a weekend more than 21 days out stays at the base', () => {
  const decision = promotionForNight({ ...open, date: '2026-11-27', asOf: '2026-10-29', holiday: false });
  assert.equal(decision.percent, 0);
  assert.equal(decision.offerGuest, 1000);
  assert.match(decision.reason, /21 days/);
});

test('an open weekend inside 21 days takes 20 percent off and keeps the base', () => {
  const decision = promotionForNight({ ...open, date: '2026-11-06', asOf: '2026-10-29', holiday: false });
  assert.equal(decision.percent, 20);
  assert.equal(decision.offerGuest, 800);
});

test('a holiday waits until 14 days', () => {
  const early = promotionForNight({ ...open, date: '2026-11-26', asOf: '2026-10-29', holiday: true });
  assert.equal(early.percent, 0);
  const due = promotionForNight({ ...open, date: '2026-11-26', asOf: '2026-11-16', holiday: true });
  assert.equal(due.percent, 20);
  assert.equal(due.offerGuest, 800);
});

test('a weekday promotes once that Friday and Saturday are booked', () => {
  const { friday, saturday } = weekWeekend('2026-12-02');
  assert.equal(friday, '2026-12-04');
  assert.equal(saturday, '2026-12-05');
  const waiting = promotionForNight({
    ...open,
    date: '2026-12-02',
    asOf: '2026-10-29',
    holiday: false,
    taken: new Set([friday]),
  });
  assert.equal(waiting.percent, 0);
  const due = promotionForNight({
    ...open,
    date: '2026-12-02',
    asOf: '2026-10-29',
    holiday: false,
    taken: new Set([friday, saturday]),
  });
  assert.equal(due.percent, 20);
  assert.match(due.reason, /Friday and Saturday are booked/);
});

test('a full year gets no promotion', () => {
  const decision = promotionForNight({
    ...open,
    date: '2026-11-06',
    asOf: '2026-10-29',
    holiday: false,
    pace: 'met',
  });
  assert.equal(decision.percent, 0);
  assert.match(decision.reason, /on the books/);
});

test('the floor stops a promotion that would cut through it', () => {
  const decision = promotionForNight({
    ...open,
    ourGuest: 1000,
    floorGuest: 900,
    date: '2026-11-06',
    asOf: '2026-10-29',
    holiday: false,
  });
  assert.equal(decision.percent, 0);
  assert.equal(decision.offerGuest, 1000);
});
