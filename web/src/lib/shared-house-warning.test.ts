/**
 * A host is told when accepting a part booking puts two parties in one house.
 *
 * The Riverhouse has one door code for the whole building. The pricing panel warns a host before a price invites a
 * split, but the moment the decision is actually made is when they accept a part request — and there the line said only
 * "the Main Lodge is booked for 3 nights", with no hint that another guest holds the Recreation Wing and the same code.
 *
 * That is the same class as the other defects in this build: the fact was known to the system and not said where a
 * person acts on it.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { otherPartsOccupied } from './river-units.ts';
import { acceptHold, acceptedLine, sharedHouseWarning } from './booking-accept.ts';

const ASOF = '2026-11-10';

function request(units: string[], checkIn = '2027-03-01', checkOut = '2027-03-04') {
  return {
    id: 'book-part-1',
    propertyId: 'river',
    checkIn,
    checkOut,
    guests: 4,
    units,
  };
}

test('a part with nobody else in the house says nothing about sharing', () => {
  const result = acceptHold({
    request: request(['garage-suite']),
    alreadyAccepted: false,
    plan: { payout: 1200, units: ['garage-suite'] },
    asOf: ASOF,
  });
  assert.ok(result.ok, result.ok ? '' : result.reason);
  assert.equal(result.plan.sharedWith, undefined, 'a shared-house warning appeared with nobody else there');

  const line = acceptedLine(result.plan);
  assert.doesNotMatch(line, /another party/, 'the line warned about a second party that does not exist');
  assert.doesNotMatch(line, /door code/, 'the line mentioned the door code for a private booking');
});

test('a part alongside another party warns that they share the building and one code', () => {
  const result = acceptHold({
    request: request(['garage-suite']),
    alreadyAccepted: false,
    plan: { payout: 1200, units: ['garage-suite'], sharedWith: ['River Recreation Wing'] },
    asOf: ASOF,
  });
  assert.ok(result.ok, result.ok ? '' : result.reason);

  const line = acceptedLine(result.plan);
  assert.match(line, /River Recreation Wing/, 'the occupied part is not named');
  assert.match(line, /another party/, 'the second party is not mentioned');
  assert.match(line, /one door code opens every part/, 'the consequence is not stated');
  assert.match(line, /its own lock|do not sell parts on the same nights/, 'no remedy is offered');

  // And it carries no markdown, because this string goes straight into a JSX paragraph.
  assert.doesNotMatch(line, /\*\*/, 'markdown bold reached the host as literal asterisks');
});

test('the warning names a part, never the other guest', () => {
  /*
   * The other party's stay is somebody else's record. Naming the part is all the host needs; a name would put one
   * guest's booking into another guest's confirmation.
   */
  const result = acceptHold({
    request: request(['garage-suite']),
    alreadyAccepted: false,
    plan: { payout: 1200, units: ['garage-suite'], sharedWith: ['River Recreation Wing'] },
    asOf: ASOF,
  });
  assert.ok(result.ok);
  const line = acceptedLine(result.plan);
  assert.equal(line.includes('Direct guest'), false, 'the line named the other guest');
});

test('two occupied parts are both named, with the right verb', () => {
  const result = acceptHold({
    request: request(['garage-suite']),
    alreadyAccepted: false,
    plan: { payout: 1200, units: ['garage-suite'], sharedWith: ['River Recreation Wing', 'River Main Lodge'] },
    asOf: ASOF,
  });
  assert.ok(result.ok);
  const line = acceptedLine(result.plan);
  assert.match(line, /River Recreation Wing and River Main Lodge/);
  assert.match(line, /\bare occupied\b/, 'two parts were described with a singular verb');
});

test('a whole-house booking never warns about sharing', () => {
  // A whole-house booking occupies every part, so there is nobody else in the building to warn about.
  const result = acceptHold({
    request: { ...request([]), units: undefined },
    alreadyAccepted: false,
    plan: { payout: 4000 },
    asOf: ASOF,
  });
  assert.ok(result.ok);
  assert.equal(result.plan.sharedWith, undefined);
  assert.doesNotMatch(acceptedLine(result.plan), /another party/);
});

test('otherPartsOccupied reads the real calendar, not the parts being sold', () => {
  /*
   * The parts this booking takes are the guest's own, so naming them back would read as if they were somebody else's.
   * This exercises the helper directly against spans.
   */
  const spans = [
    // Another party holds the Recreation Wing for the same nights.
    { propertyId: 'river', checkIn: '2027-03-01', checkOut: '2027-03-04', units: ['recreation-wing'] },
  ];

  const occupied = otherPartsOccupied(
    spans as never,
    { units: ['garage-suite'] as never, checkIn: '2027-03-01', checkOut: '2027-03-04' },
    '2027-03-01',
    '2027-03-04',
  );
  assert.deepEqual(occupied, ['River Recreation Wing'], 'the occupied part was not reported');

  // And the part being sold is not reported back as somebody else's.
  assert.equal(occupied.includes('River Garage Suite'), false, 'the booking reported itself as another party');
});

test('a part held on a different night is not reported', () => {
  const spans = [{ propertyId: 'river', checkIn: '2027-03-10', checkOut: '2027-03-12', units: ['recreation-wing'] }];
  const occupied = otherPartsOccupied(
    spans as never,
    { units: ['garage-suite'] as never, checkIn: '2027-03-01', checkOut: '2027-03-04' },
    '2027-03-01',
    '2027-03-04',
  );
  assert.deepEqual(occupied, [], 'a part on other nights was reported as sharing');
});

test('the inbox renders the warning rather than swallowing it', () => {
  /*
   * The whole point of computing this is that a host reads it. A route that returns `sharedHouse` and an inbox that
   * only prints `line` would be the same defect one layer down: a fact known and not shown.
   */
  const INBOX = fs.readFileSync('src/components/RequestInbox.tsx', 'utf8');
  assert.match(INBOX, /result\.sharedHouse/, 'the inbox ignores the shared-house warning');
  assert.match(INBOX, /data-bot="request-inbox-shared-house"/, 'the warning has no element to render into');

  const ROUTE = fs.readFileSync('functions/api/book/accept.ts', 'utf8');
  assert.match(ROUTE, /sharedHouse: sharedHouseWarning\(/, 'the route does not return the warning');

  const API = fs.readFileSync('src/lib/api.ts', 'utf8');
  assert.match(API, /sharedHouse\?: string \| null/, 'the client type does not carry the warning');
});

test('the warning is its own field, so a surface can style it as a warning', () => {
  const result = acceptHold({
    request: request(['garage-suite']),
    alreadyAccepted: false,
    plan: { payout: 1200, units: ['garage-suite'], sharedWith: ['River Recreation Wing'] },
    asOf: ASOF,
  });
  assert.ok(result.ok);

  const warning = sharedHouseWarning(result.plan);
  assert.ok(warning, 'no warning was produced');
  assert.match(warning!, /River Recreation Wing/);
  assert.match(warning!, /one door code/);
  // The remedy lives in the inbox copy, so the field itself stays a statement of fact.
  assert.doesNotMatch(warning!, /\*\*/);

  // And null, not an empty string, when nobody else is there.
  const alone = acceptHold({
    request: request(['garage-suite']),
    alreadyAccepted: false,
    plan: { payout: 1200, units: ['garage-suite'] },
    asOf: ASOF,
  });
  assert.ok(alone.ok);
  assert.equal(sharedHouseWarning(alone.plan), null, 'a shared-house warning appeared for an empty house');
});
