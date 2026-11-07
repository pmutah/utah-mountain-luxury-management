import assert from 'node:assert/strict';
import test from 'node:test';
import { judgeTrial, judgeCardTrial, rateGuardLine } from './whatif.ts';

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

test('a night no stay can cover does not take a new base', () => {
  const verdict = judgeTrial({ ...open, unbookable: true, trialGuest: 1080 });
  assert.equal(verdict.wouldRaise, false);
  assert.equal(verdict.blockedBy.includes('gap'), true);
  assert.match(verdict.note, /This night cannot be booked\. The published rate stays\./);
  assert.equal(verdict.note.includes('$'), false);
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

test('the rate rules stay on the desk with no price', () => {
  const line = rateGuardLine();
  assert.match(line, /at or above the floor/);
  assert.match(line, /at or below the ceiling/);
  assert.match(line, /inside 8%/);
  assert.match(line, /published base is not lowered/);
  assert.match(line, /Nothing is posted/);
  assert.equal(line.includes('$'), false);
  assert.equal(/\bopen\b/i.test(line), false);
});

test('a rate-card ask is judged while the calendar is unread and the night is not raised', () => {
  const card = {
    publishedGuest: open.publishedGuest,
    floorGuest: open.floorGuest,
    ceilingGuest: open.ceilingGuest,
    maxMove: open.maxMove,
    compRates: open.compRates,
    holiday: false,
  };
  const raise = judgeCardTrial({ ...card, trialGuest: 1080 });
  assert.equal(raise.wouldRaise, false);
  assert.match(raise.note, /This night is not raised/);
  assert.match(raise.note, /The calendar was not read/);
  assert.match(raise.note, /does not say the night is booked or open/);
  assert.match(raise.note, /Nothing is posted/);
  assert.equal(raise.note.includes('$'), false);
  assert.equal(raise.note.includes('new base'), false);
  assert.equal(/\bthe house is open\b/i.test(raise.note), false);

  const lower = judgeCardTrial({ ...card, trialGuest: 900 });
  assert.equal(lower.wouldRaise, false);
  assert.match(lower.note, /published base stays/);
  assert.match(lower.note, /Nothing is posted/);

  const holiday = judgeCardTrial({ ...card, holiday: true, trialGuest: 1080 });
  assert.match(holiday.note, /Holiday rate stays/);
  assert.equal(holiday.wouldRaise, false);
  assert.equal(holiday.note.includes('$'), false);
});
