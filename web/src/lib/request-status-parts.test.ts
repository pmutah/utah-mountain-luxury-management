import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { requestView } from './request-status.ts';

/*
 * The guest's own request link showed the house, the dates, and the party — and nothing about which part of the
 * Riverhouse they had asked for. A guest who had just requested the Garage Suite could not tell from their own link what
 * they had asked for, while the confirmation email already named it.
 *
 * The page also has a job stated in its own footer: no price, no door code, no way in, no guest name. Widening what it
 * shows must not widen that.
 */

const decision = {
  requestId: 'book-1',
  stays: [],
  decline: null,
  hold: null,
  asOf: '2026-11-09',
  now: '2026-11-09T12:00:00.000Z',
};

const base = {
  propertyId: 'river',
  checkIn: '2027-03-10',
  checkOut: '2027-03-12',
  guests: 3,
};

test('a part request names the part on the guest status page', () => {
  const view = requestView({ ...base, units: ['garage-suite'] }, decision);
  assert.ok(view, 'the view was refused');
  assert.deepEqual(view!.parts, ['River Garage Suite']);
});

test('two parts are both named', () => {
  const view = requestView({ ...base, units: ['garage-suite', 'main-lodge'] }, decision);
  assert.deepEqual(view!.parts, ['River Garage Suite', 'River Main Lodge']);
});

test('a whole-house request carries no parts, which is what every earlier request means', () => {
  const view = requestView(base, decision);
  assert.equal(view!.parts, undefined);
  const empty = requestView({ ...base, units: [] }, decision);
  assert.equal(empty!.parts, undefined);
});

test('an unknown part name is dropped rather than shown raw', () => {
  // Dropping it leaves the request reading as the whole house, which is the safe direction.
  const view = requestView({ ...base, units: ['attic'] }, decision);
  assert.equal(view!.parts, undefined);
});

test('naming the part does not widen what the page exposes', () => {
  const view = requestView(
    { ...base, units: ['main-lodge'], note: 'my private note', email: 'guest@example.com', phone: '8015550100' },
    decision,
  ) as unknown as Record<string, unknown>;
  for (const forbidden of ['note', 'email', 'phone', 'payout', 'guestTotal', 'doorCode', 'wifiPassword']) {
    assert.equal(forbidden in view, false, `the status page now carries ${forbidden}`);
  }
});

test('the part does not change the status of the request', () => {
  /*
   * `requestView` returns the facts; the sentence a guest reads is built elsewhere. So this checks the status only, and
   * a test that asserted a `line` here would be asserting a property this function does not have.
   */
  const waiting = requestView({ ...base, units: ['garage-suite'] }, decision);
  assert.equal(waiting!.status, 'waiting');
  // The part is added without disturbing any other fact.
  const whole = requestView(base, decision);
  assert.deepEqual(
    { ...waiting!, parts: undefined },
    { ...whole!, parts: undefined },
    'naming the part changed something else about the request',
  );
});

test('the route puts the part on the wire, not only on the view', () => {
  /*
   * The route rebuilds the guest response field by field rather than spreading the view, so a new field on the view does
   * not reach the browser by itself. That is exactly how `parts` was lost: the view had it, the payload did not, and the
   * page stayed silent.
   */
  const route = readFileSync(new URL('../../functions/api/book/request/[token].ts', import.meta.url), 'utf8');
  assert.match(route, /view\.parts/, 'the route never reads the parts off the view');
  assert.match(route, /\.\.\.\(view\.parts && view\.parts\.length > 0 \? \{ parts: view\.parts \} : \{\}\)/, 'the parts are not sent');
});
