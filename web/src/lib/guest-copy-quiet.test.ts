import assert from 'node:assert/strict';
import test from 'node:test';
import { stayCountdown, rightNow, arrivalJourney } from './journey.ts';
import { arriveReadyNote } from './arrive-ready.ts';
import { houseDayNote } from './house-day.ts';
import { preferenceCardNote } from './preference-choices.ts';

/*
 * The River guest phone said "Nothing is sent." **20 times** and "does not sign" 29 times on a single
 * stay — 49 disclaimers on one page. Some of those are load-bearing: this phone genuinely cannot sign the
 * stay agreement, and a quote must not read as a confirmation. But a check-in countdown ending in
 * "Nothing is sent." tells a guest about our plumbing, and a page that repeats it twenty times trains
 * them to skip the sentences that matter.
 *
 * These tests pin which surfaces keep the guard and which lost the noise.
 */

test('a countdown says how long, and nothing about what we transmit', () => {
  const phone = stayCountdown('2026-11-08', '2026-12-10', '2026-12-13', 'phone');
  assert.match(phone, /Check-in is in 32 nights/);
  assert.equal(/Nothing is sent/i.test(phone), false, 'the countdown carried a plumbing note');
});

test('a quote countdown still refuses to imply the house is open', () => {
  // This guard is the reason the tail exists, and it survives.
  const quote = stayCountdown('2026-11-08', '2026-12-10', '2026-12-13', 'quote');
  assert.match(quote, /does not say the house is open/);
  assert.equal(quote.includes('$'), false);
});

test('the arrival list keeps what helps a guest and drops what does not', () => {
  const phone = arriveReadyNote('phone');
  // Useful: the tick is saved on this page.
  assert.match(phone, /A check stays on this page/);
  assert.equal(/Nothing is sent/i.test(phone), false);

  // A quote still cannot imply the house is open.
  assert.match(arriveReadyNote('quote'), /does not say the house is open/);
});

test('the day card keeps "no price" and drops the plumbing note', () => {
  const phone = houseDayNote('phone');
  assert.match(phone, /No price is quoted/);
  assert.equal(/Nothing is sent/i.test(phone), false);
  assert.match(houseDayNote('quote'), /does not say the house is open/);
});

test('a guest page cannot accumulate plumbing notes', () => {
  // The phrases a stay page is built out of, as the guest reads them.
  const page = [
    stayCountdown('2026-11-08', '2026-12-10', '2026-12-13', 'phone'),
    arriveReadyNote('phone'),
    houseDayNote('phone'),
    preferenceCardNote(0),
    preferenceCardNote(2),
  ].join('\n');
  const count = (page.match(/Nothing is sent/gi) ?? []).length;
  assert.equal(count, 0, `a guest page carried ${count} "Nothing is sent" notes`);
});

test('the preference card says whether a card exists, not what we transmit', () => {
  assert.match(preferenceCardNote(0), /no preference card yet/i);
  assert.match(preferenceCardNote(3), /shows the preference card/i);
  assert.equal(/Nothing is sent/i.test(preferenceCardNote(0) + preferenceCardNote(3)), false);
});

test('the trip summary says what is open, not what we transmit', () => {
  const steps = arrivalJourney({
    asOf: '2026-11-08',
    checkIn: '2026-12-10',
    checkOut: '2026-12-13',
    opensOn: '2026-12-09',
    checkInTime: '4:00 PM',
    checkOutTime: '11:00 AM',
    phase: 'before',
    preferencesDone: false,
    hasSurvey: false,
    agreementRead: false,
  });
  const summary = rightNow(steps);
  assert.match(summary, /Right now: /);
  assert.equal(/Nothing is sent/i.test(summary), false, 'the trip summary carried a plumbing note');
});
