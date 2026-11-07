import assert from 'node:assert/strict';
import test from 'node:test';
import { emailKey, phoneKey, returningGuest, returningLine } from './returning-guest.ts';

const ASOF = '2026-11-07';

const past = [
  { guestName: 'Ada Lovelace', guestEmail: 'ada@example.com', guestPhone: '+18017874722', checkOut: '2026-03-02' },
  { guestName: 'Ada Lovelace', guestEmail: 'ada@example.com', guestPhone: '+18017874722', checkOut: '2026-08-14' },
  { guestName: 'Grace Hopper', guestEmail: 'grace@example.com', guestPhone: '+18015550000', checkOut: '2026-06-01', status: 'cancelled' },
  { guestName: 'FUTURE', guestEmail: 'future@example.com', checkOut: '2027-01-03' },
];

test('a phone matches however it is typed', () => {
  assert.equal(phoneKey('+1 (801) 787-4722'), '8017874722');
  assert.equal(phoneKey('8017874722'), '8017874722');
  assert.equal(phoneKey('1-801-787-4722'), '8017874722');
  assert.equal(phoneKey('801-787-4722'), '8017874722');
  assert.equal(phoneKey('12345'), '');
  assert.equal(phoneKey(undefined), '');
});

test('an email matches only when it looks like one', () => {
  assert.equal(emailKey('  Ada@Example.COM '), 'ada@example.com');
  assert.equal(emailKey('not-an-email'), '');
  assert.equal(emailKey(undefined), '');
});

test('a past email is a returning guest, with the last stay named', () => {
  const check = returningGuest({ email: 'ada@example.com' }, past, ASOF);
  assert.equal(check.returning, true);
  assert.equal(check.stays, 2);
  assert.equal(check.lastStay, '2026-08-14');
  const line = returningLine(check);
  assert.match(line, /stayed before/);
  assert.match(line, /August 2026/);
  assert.match(line, /2 past stays/);
  assert.equal(line.includes('ada@example.com'), false, 'the contact detail leaked into the line');
});

test('a past phone is a returning guest too', () => {
  const check = returningGuest({ phone: '(801) 787-4722' }, past, ASOF);
  assert.equal(check.returning, true);
  assert.equal(check.stays, 2);
});

test('a cancelled stay is not a past stay', () => {
  const check = returningGuest({ email: 'grace@example.com' }, past, ASOF);
  assert.equal(check.returning, false);
  assert.equal(check.stays, 0);
});

test('a stay that has not checked out yet is not a past stay', () => {
  const check = returningGuest({ email: 'future@example.com' }, past, ASOF);
  assert.equal(check.returning, false);
});

test('a stranger is not returning, and the line says so without inventing', () => {
  const check = returningGuest({ email: 'new@example.com', phone: '8010000000' }, past, ASOF);
  assert.equal(check.returning, false);
  assert.equal(check.lastStay, null);
  assert.match(returningLine(check), /New to us/);
});

test('no contact detail is not a returning guest', () => {
  assert.deepEqual(returningGuest({}, past, ASOF), { returning: false, lastStay: null, stays: 0 });
  assert.deepEqual(returningGuest({ email: '', phone: '' }, past, ASOF), { returning: false, lastStay: null, stays: 0 });
});

test('a name alone never makes someone returning', () => {
  // Same name, different contact. Pricing a stranger as a repeat guest would be wrong.
  const check = returningGuest({ email: 'someone-else@example.com' }, past, ASOF);
  assert.equal(check.returning, false);
});

test('one past stay reads in the singular', () => {
  const check = returningGuest({ email: 'future@example.com' }, [...past, { guestEmail: 'future@example.com', checkOut: '2026-09-01' }], ASOF);
  assert.equal(check.stays, 1);
  assert.match(returningLine(check), /1 past stay\)/);
});
