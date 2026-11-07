/**
 * The stay timeline was preview-only: a host could read the seven messages a stay would receive and no
 * button ever sent one. These tests pin the rules that make a send safe, because each one guards a
 * specific way a guest email goes wrong.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canSendMessage,
  messageOpensOn,
  sendableLine,
  sendableToday,
  unsafeGuestText,
} from './stay-message-send.ts';

// A stay two weeks out, so every window can be exercised by moving the send day.
const CHECK_IN = '2027-03-01';
const CHECK_OUT = '2027-03-05';

const send = (asOf: string, id: string, alreadySent?: string[]) =>
  canSendMessage({
    house: 'river',
    checkIn: CHECK_IN,
    checkOut: CHECK_OUT,
    id,
    asOf,
    ...(alreadySent ? { alreadySent } : {}),
  });

test('a message sent on the wrong day is refused, and says which day it is for', () => {
  const early = send('2027-01-01', 'week');
  assert.equal(early.ok, false);
  const reason = (early as { reason: string }).reason;
  assert.match(reason, /not right to send today/);
  assert.match(reason, /Nothing was sent/);

  const right = send('2027-02-22', 'week');
  assert.equal(right.ok, true);
});

test('a checkout message cannot go before the stay has started', () => {
  assert.equal(send('2027-02-01', 'leave').ok, false);
  assert.equal(send('2027-03-04', 'leave').ok, true);
});

test('an arrival message only goes on the arrival day', () => {
  assert.equal(send('2027-03-01', 'arrive').ok, true);
  assert.equal(send('2027-02-28', 'arrive').ok, false);
});

test('a review note waits until the guest has left', () => {
  assert.equal(send('2027-03-04', 'review').ok, false, 'a review note went while the guest was still in the house');
  assert.equal(send('2027-03-05', 'review').ok, true);
  assert.equal(send('2027-06-01', 'review').ok, false);
});

test('a message that points at a stay page is refused while the guest app is off', () => {
  /*
   * The week-before note says "the house rules are on your stay page". With the guest app off, that
   * page answers 403, so the message sends the guest to a dead end.
   */
  const week = (guestAppOn: boolean) =>
    canSendMessage({
      house: 'river',
      checkIn: CHECK_IN,
      checkOut: CHECK_OUT,
      id: 'week',
      asOf: '2027-02-22',
      guestAppOn,
    });
  assert.equal(week(true).ok, true);
  const off = week(false);
  assert.equal(off.ok, false);
  assert.match((off as { reason: string }).reason, /guest app is off for this house/);
  assert.match((off as { reason: string }).reason, /Turn the app on/);
});

test('a message that does not point at the stay page still goes while the app is off', () => {
  // The arrival note is about parking and the way in, not the stay page.
  const ready = sendableToday({
    house: 'river',
    checkIn: CHECK_IN,
    checkOut: CHECK_OUT,
    asOf: '2027-03-01',
    guestAppOn: false,
  });
  const ids = ready.map((m) => m.id);
  assert.ok(ids.includes('arrive'), 'the arrival note was refused even though it needs no stay page');
  assert.equal(ids.includes('week'), false, 'a stay-page message was offered while the app is off');
});

test('the same message is never sent twice', () => {
  const again = send('2027-02-22', 'week', ['week']);
  assert.equal(again.ok, false);
  assert.match((again as { reason: string }).reason, /already gone to this guest/);
});

test('a message the house does not have is refused', () => {
  assert.equal(send('2027-02-22', 'nonsense').ok, false);
  assert.equal(send('2027-02-22', '').ok, false);
});

test('a stay with unusable dates sends nothing', () => {
  const base = { house: 'river' as const, id: 'booked', asOf: '2027-01-01' };
  assert.equal(canSendMessage({ ...base, checkIn: '2027-13-01', checkOut: CHECK_OUT }).ok, false);
  assert.equal(canSendMessage({ ...base, checkIn: CHECK_OUT, checkOut: CHECK_IN }).ok, false);
  assert.equal(canSendMessage({ ...base, checkIn: CHECK_IN, checkOut: CHECK_IN }).ok, false);
});

test('a price, a code value, or a password value is never allowed out', () => {
  assert.match(unsafeGuestText('The total is $1,200.') ?? '', /price/);
  assert.match(unsafeGuestText('The door code is 4412.') ?? '', /door code/);
  assert.match(unsafeGuestText('Door code: 4412#') ?? '', /door code/);
  assert.match(unsafeGuestText('The password is riverguest.') ?? '', /password/);
  // A URL carrying a code must not slip through either.
  assert.match(unsafeGuestText('The access code for the gate is 8812') ?? '', /door code/);

  // Mentioning that the code is NOT in the message is exactly what these messages do, and is safe.
  assert.equal(unsafeGuestText('The door code stays off this message.'), null);
  assert.equal(unsafeGuestText('The door code and Wi-Fi open on your phone the day before.'), null);
  assert.equal(unsafeGuestText('Check-in is at 4pm. Park in the driveway.'), null);
});

test('every real message passes its own safety check', () => {
  // A message whose own wording trips the guard could never be sent, which would be a broken feature.
  const ready = sendableToday({ house: 'river', checkIn: CHECK_IN, checkOut: CHECK_OUT, asOf: '2027-03-01' });
  assert.ok(ready.length > 0);
  for (const message of ready) {
    assert.equal(
      unsafeGuestText(`${message.subject} ${message.body}`),
      null,
      `the "${message.id}" message trips its own safety guard`,
    );
  }
});

test('the desk is told which messages are ready today', () => {
  const onArrival = sendableToday({ house: 'river', checkIn: CHECK_IN, checkOut: CHECK_OUT, asOf: '2027-03-01' });
  assert.ok(onArrival.some((m) => m.id === 'arrive'));
  assert.ok(onArrival.some((m) => m.id === 'booked'));
  assert.equal(onArrival.some((m) => m.id === 'leave'), false);

  assert.match(sendableLine(onArrival, []), /ready to send today/);
  assert.match(sendableLine(onArrival, []), /Nothing is sent on its own/);
  assert.equal(sendableLine([], []).includes('$'), false);
  assert.match(sendableLine([], []), /Nothing is sent on its own/);
  assert.match(sendableLine([], ['week']), /No other message is right for today/);
});

test('the desk can be told when a message opens', () => {
  assert.equal(messageOpensOn('week', CHECK_IN, CHECK_OUT), '2027-02-21');
  assert.equal(messageOpensOn('eve', CHECK_IN, CHECK_OUT), '2027-02-27');
  assert.equal(messageOpensOn('arrive', CHECK_IN, CHECK_OUT), '2027-03-01');
  assert.equal(messageOpensOn('leave', CHECK_IN, CHECK_OUT), '2027-03-04');
  assert.equal(messageOpensOn('review', CHECK_IN, CHECK_OUT), '2027-03-05');
});
