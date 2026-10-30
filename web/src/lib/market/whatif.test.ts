import assert from 'node:assert/strict';
import test from 'node:test';
import { judgeTrial } from './whatif.ts';

const open = {
  publishedGuest: 1000,
  floorGuest: 800,
  ceilingGuest: 2000,
  maxMove: 0.08,
  compRates: [900, 1000, 1200, 1400, 1600],
  closed: false,
  booked: false,
  holiday: false,
};

test('the published ask is not a new base', () => {
  const verdict = judgeTrial({ ...open, trialGuest: 1000 });
  assert.equal(verdict.wouldRaise, false);
  assert.deepEqual(verdict.blockedBy, []);
  assert.match(verdict.note, /published ask/);
});

test('a raise inside 8 percent can become the new base', () => {
  const verdict = judgeTrial({ ...open, trialGuest: 1080 });
  assert.equal(verdict.wouldRaise, true);
  assert.equal(verdict.dailyCap, 1080);
  assert.match(verdict.note, /new base at p/);
});

test('the daily cap stops a larger jump', () => {
  const verdict = judgeTrial({ ...open, trialGuest: 1081 });
  assert.equal(verdict.wouldRaise, false);
  assert.equal(verdict.blockedBy.includes('daily'), true);
});

test('a lower ask is not a new base', () => {
  const verdict = judgeTrial({ ...open, trialGuest: 900 });
  assert.equal(verdict.wouldRaise, false);
  assert.equal(verdict.blockedBy.includes('base'), true);
  assert.match(verdict.note, /published base stays/);
});

test('a booked night stays at the published rate', () => {
  const verdict = judgeTrial({ ...open, booked: true, trialGuest: 1080 });
  assert.equal(verdict.wouldRaise, false);
  assert.match(verdict.note, /booked/);
});

test('a holiday does not take a new base', () => {
  const verdict = judgeTrial({ ...open, holiday: true, trialGuest: 1080 });
  assert.equal(verdict.wouldRaise, false);
  assert.match(verdict.note, /Holiday/);
});

test('the ceiling stops a rate even inside a wide daily cap', () => {
  const verdict = judgeTrial({ ...open, maxMove: 2, ceilingGuest: 1500, trialGuest: 1600 });
  assert.equal(verdict.blockedBy.includes('ceiling'), true);
  assert.match(verdict.note, /ceiling/);
});
