import assert from 'node:assert/strict';
import test from 'node:test';
import { acceptedLine, type AcceptPlan } from './booking-accept.ts';

/*
 * The host's confirmation line is what tells them what the accept actually did. For a part booking it must name the
 * part: "The River House is booked" when only the Main Lodge was sold reads as the whole house being gone, and the
 * other two parts being unsellable — the opposite of the rule.
 */

const plan = (over: Partial<AcceptPlan> = {}): AcceptPlan => ({
  propertyId: 'river',
  checkIn: '2027-03-10',
  checkOut: '2027-03-12',
  nights: 2,
  guestName: 'Direct guest',
  note: '',
  payout: 900,
  source: 'Direct',
  ...over,
});

test('a whole-house booking still reads as the house', () => {
  const line = acceptedLine(plan());
  assert.match(line, /^The River House is booked for 2 nights/);
  assert.equal(line.includes('$'), false, 'the line quoted a rate');
});

test('a part booking names the part, not the whole house', () => {
  const line = acceptedLine(plan({ units: ['main-lodge'] }));
  assert.match(line, /River Main Lodge at the River House is booked/);
  assert.equal(/^The River House is booked/.test(line), false, 'a part booking claimed the whole house');
});

test('two parts are both named, in a readable order', () => {
  const line = acceptedLine(plan({ units: ['garage-suite', 'main-lodge'] }));
  assert.match(line, /River Garage Suite and River Main Lodge/);
});

test('a part on a house that is not River is not called a part', () => {
  // Defensive: only River is sold in parts, so a stray `units` must not change a Ranch line.
  const line = acceptedLine(plan({ propertyId: 'ranch', units: ['main-lodge'] }));
  assert.match(line, /^The Ranch House is booked/);
});

test('an empty unit list is the whole house, which is what every earlier booking means', () => {
  const line = acceptedLine(plan({ units: [] }));
  assert.match(line, /^The River House is booked/);
});
