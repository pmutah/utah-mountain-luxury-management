import assert from 'node:assert/strict';
import test from 'node:test';
import {
  amountFor,
  calendarBatches,
  calendarBody,
  sendHold,
  HOSPITABLE_MAX_DATES,
} from './hospitable-write.ts';

/*
 * The sender the app never had. Hospitable does publish a calendar write — `PUT /v2/properties/{uuid}/calendar`,
 * `calendar:write` scope, 202 accepted, max 60 dates — so this is buildable code, not a missing credential.
 *
 * These tests cover the part that can be proven without a token: the payload, the batching, and the refusals.
 * The two facts that must not be guessed — price unit and property uuid — are required inputs, and the
 * refusals say why.
 */

test('a rate becomes the amount to send, in the declared unit', () => {
  assert.equal(amountFor(2160, 'dollars'), 2160);
  assert.equal(amountFor(2160, 'cents'), 216000);
  // The two units differ by 100x, which is exactly why the unit is required and never inferred.
  assert.equal(amountFor(2160, 'cents'), amountFor(2160, 'dollars') * 100);
});

test('a fractional cent is refused rather than rounded silently', () => {
  // $2160.405 cannot be a whole number of cents. Rounding it is a pricing decision, not ours to make.
  assert.equal(amountFor(2160.405, 'cents'), null);
  assert.equal(amountFor(0, 'cents'), null);
  assert.equal(amountFor(-5, 'dollars'), null);
  assert.equal(amountFor(Number.NaN, 'dollars'), null);
});

test('the body carries the date, the price and availability', () => {
  const body = calendarBody([{ date: '2026-12-13', rate: 2160 }], 'dollars', 2);
  assert.ok('dates' in body);
  assert.deepEqual(body.dates, [
    { date: '2026-12-13', price: { amount: 2160 }, available: true, min_stay: 2 },
  ]);
});

test('a bad date or a duplicate is skipped and named, not quietly dropped', () => {
  const body = calendarBody(
    [
      { date: '2026-12-13', rate: 2160 },
      { date: '2026-12-13', rate: 2200 },
      { date: '13-12-2026', rate: 2160 },
    ],
    'dollars',
  );
  assert.ok('dates' in body);
  assert.equal(body.dates.length, 1, 'only the first good night should be sent');
  assert.equal(body.skipped.length, 2);
  assert.match(body.skipped.map((s) => s.why).join(' '), /twice/);
  assert.match(body.skipped.map((s) => s.why).join(' '), /YYYY-MM-DD/);
});

test('a request over 60 dates is refused and the batcher splits it', () => {
  // Unique dates so the duplicate rule does not muddy the count.
  const unique = Array.from({ length: 61 }, (_, i) => {
    const day = new Date(Date.UTC(2027, 0, 1 + i));
    return { date: day.toISOString().slice(0, 10), rate: 1000 + i };
  });
  const over = calendarBody(unique, 'dollars');
  assert.ok('error' in over);
  assert.match(over.error, /over Hospitable's limit of 60/);

  const batches = calendarBatches(unique, 'dollars');
  assert.equal(batches.length, 2);
  assert.equal(batches[0]!.dates.length, HOSPITABLE_MAX_DATES);
  assert.equal(batches[1]!.dates.length, 1);
  assert.equal(batches.reduce((n, b) => n + b.dates.length, 0), 61, 'batching must not lose a night');
});

test('nothing is sent without a token, a uuid, a unit, or a way back', () => {
  const base = { hasToken: true, uuid: 'abc', unit: 'cents' as const, restorable: true };
  assert.equal(sendHold(base), null, 'a complete set should clear the hold');

  assert.match(sendHold({ ...base, hasToken: false }) ?? '', /no Hospitable write token/);
  assert.match(sendHold({ ...base, uuid: null }) ?? '', /not mapped to a Hospitable property uuid/);
  assert.match(sendHold({ ...base, unit: null }) ?? '', /price unit has not been confirmed/);
  assert.match(sendHold({ ...base, restorable: false }) ?? '', /cannot be reversed/);

  // The unit refusal must name the consequence, because that is what makes it worth refusing.
  assert.match(sendHold({ ...base, unit: undefined }) ?? '', /100x/);
});
