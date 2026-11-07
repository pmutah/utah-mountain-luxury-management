import assert from 'node:assert/strict';
import test from 'node:test';
import { arrivalJourney, checkoutNightIsFree, nightBeforeIsFree, rightNow, stayCalendarHold, stayCountdown, stayMoment, stayNightFlags } from './journey.ts';

const stay = {
  asOf: '2026-10-29',
  checkIn: '2026-11-06',
  checkOut: '2026-11-08',
  opensOn: '2026-11-05',
  preferencesDone: false,
  checkInTime: '4:00 PM',
  checkOutTime: '11:00 AM',
  phase: 'before' as const,
  nightBeforeFree: true,
};

test('a paused booking read does not call a night free', () => {
  assert.deepEqual(stayNightFlags(true, true, true), { nightBeforeFree: null, checkoutNightFree: null });
  assert.deepEqual(stayNightFlags(false, true, false), { nightBeforeFree: true, checkoutNightFree: false });
  const hold = stayCalendarHold(true);
  assert.match(hold, /does not say a night is free/);
  assert.match(hold, /Nothing was written over them/);
  assert.equal(stayCalendarHold(false), '');
  const loading = stayCalendarHold(true, false, true);
  assert.match(loading, /Checking the booking calendar/);
  assert.equal(loading.includes('does not say a night is free'), false);
  const known = stayCalendarHold(true, true);
  assert.match(known, /use the booking calendar/);
  assert.equal(known.includes('does not say a night is free'), false);
  assert.equal(known.includes('$'), false);
  assert.equal(hold.includes('$'), false);
  assert.equal(/door\s*code|wi-?fi|password/i.test(hold), false);
});

test('the trip starts with the group form and keeps the door code on its date', () => {
  const steps = arrivalJourney(stay);
  const agree = steps.find((step) => step.id === 'agree');
  assert.equal(agree?.state, 'now');
  assert.match(agree?.detail ?? '', /does not sign it/);
  const read = arrivalJourney({ ...stay, house: 'ranch', agreementRead: true });
  const readAgree = read.find((step) => step.id === 'agree');
  assert.equal(readAgree?.state, 'done');
  assert.match(readAgree?.detail ?? '', /This phone does not sign it/);
  assert.equal(readAgree?.detail.includes('$'), false);
  assert.equal(steps.find((step) => step.id === 'group')?.state, 'now');
  const code = steps.find((step) => step.id === 'code');
  assert.equal(code?.state, 'later');
  assert.match(code?.detail ?? '', /Nov 5/);
  const early = steps.find((step) => step.id === 'early');
  assert.equal(early?.state, 'now');
  assert.match(early?.detail ?? '', /Arrive at 1:00 PM is a request/);
  assert.match(early?.detail ?? '', /Nothing is charged yet/);
  assert.equal(/password|code\s*\d/i.test(early?.detail ?? ''), false);
  assert.equal(steps.find((step) => step.id === 'arrive')?.state, 'later');
  assert.equal(steps.find((step) => step.id === 'leave')?.detail, '11:00 AM on Nov 8');
  const held = arrivalJourney({ ...stay, asOf: '2026-11-05', agreementRead: false });
  const heldCode = held.find((step) => step.id === 'code');
  assert.match(heldCode?.detail ?? '', /stay off this phone/);
  assert.equal(/code\s*\d|\b\d{4}\b/.test(heldCode?.detail ?? ''), false);
  const shown = arrivalJourney({ ...stay, asOf: '2026-11-05', agreementRead: true });
  assert.match(shown.find((step) => step.id === 'code')?.detail ?? '', /Getting in/);
});

test('checkout names a later leave only when that morning is open', () => {
  const open = arrivalJourney({ ...stay, checkoutNightFree: true, departure: '801-555-0100' });
  const openLeave = open.find((step) => step.id === 'leave')?.detail ?? '';
  assert.match(openLeave, /Checkout is 11:00 AM on Nov 8/);
  assert.match(openLeave, /Leave at 2:00 PM is a request/);
  assert.match(openLeave, /Nothing is charged yet/);
  assert.equal(openLeave.includes('801'), false);
  assert.equal(openLeave.includes('$'), false);
  const closed = arrivalJourney({ ...stay, checkoutNightFree: false });
  const closedLeave = closed.find((step) => step.id === 'leave')?.detail ?? '';
  assert.match(closedLeave, /A later leave is not open/);
  assert.equal(closedLeave.includes('2:00 PM'), false);
  const named = arrivalJourney({ ...stay, checkoutNightFree: false, departure: '2:00 PM' });
  assert.match(named.find((step) => step.id === 'leave')?.detail ?? '', /Nothing is charged yet/);
  assert.match(named.find((step) => step.id === 'leave')?.detail ?? '', /Checkout is 11:00 AM on Nov 8/);
});

test('a booked night before arrival keeps the early arrival closed', () => {
  const steps = arrivalJourney({ ...stay, nightBeforeFree: false });
  assert.match(steps.find((step) => step.id === 'early')?.detail ?? '', /An early arrival is not open/);
  assert.equal(nightBeforeIsFree('2026-11-06', ['2026-11-05']), false);
  assert.equal(nightBeforeIsFree('2026-11-06', ['2026-11-06']), true);
  assert.equal(nightBeforeIsFree('2026-11-06', [], ['2026-11-05']), false);
  assert.equal(checkoutNightIsFree('2026-11-08', [], ['2026-11-08']), false);
});

test('the phone names one current step and leaves the code off', () => {
  const before = rightNow(arrivalJourney(stay));
  assert.match(before, /Right now: Stay agreement/);
  assert.match(before, /Two other steps are also open/);
  assert.match(before, /Nothing is sent/);
  assert.equal(before.includes('$'), false);
  assert.equal(/password|code\s*\d/i.test(before), false);
  const group = rightNow(arrivalJourney({ ...stay, agreementRead: true }));
  assert.match(group, /Right now: Your group/);
  const finished = rightNow(
    arrivalJourney({ ...stay, asOf: '2026-11-08', phase: 'after', preferencesDone: true, agreementRead: true }),
  );
  assert.match(finished, /This stay is finished/);
  assert.match(finished, /door code stays off this phone/);
  assert.equal(stayMoment('2026-10-30', '2026-11-06', '2026-11-08').includes('Nov 5'), true);
  assert.match(stayMoment('2026-11-06', '2026-11-06', '2026-11-08'), /in the house/);
  assert.match(stayMoment('2026-11-05', '2026-11-06', '2026-11-08'), /day before check-in/);
  assert.match(stayMoment('2026-11-08', '2026-11-06', '2026-11-08'), /finished/);
  assert.equal(stayMoment('2026-10-30', '2026-11-06', '2026-11-08').includes('$'), false);
});

test('a quote counts the nights until check-in and does not call the house open', () => {
  const ahead = stayCountdown('2026-10-30', '2026-11-13', '2026-11-15', 'quote');
  assert.match(ahead, /Check-in is in 14 nights/);
  assert.match(ahead, /does not say the house is open/);
  assert.match(ahead, /Nothing is sent/);
  assert.equal(ahead.includes('$'), false);
  assert.equal(/door\s*code|wi-?fi|password/i.test(ahead), false);
  assert.match(stayCountdown('2026-10-30', '2026-10-31', '2026-11-02', 'quote'), /Check-in is tomorrow at 4:00 PM/);
  assert.match(stayCountdown('2026-11-13', '2026-11-13', '2026-11-15', 'phone'), /Check-in is today at 4:00 PM/);
  assert.equal(stayCountdown('2026-11-13', '2026-11-13', '2026-11-15', 'phone').includes('does not say the house is open'), false);
  assert.match(stayCountdown('2026-11-14', '2026-11-13', '2026-11-15', 'quote'), /Checkout is tomorrow at 11:00 AM/);
  assert.equal(stayCountdown('2026-11-15', '2026-11-13', '2026-11-15'), '');
  assert.equal(stayCountdown('2026-10-30', '2026-11-15', '2026-11-13'), '');
});

test('an unknown calendar does not invent an early arrival', () => {
  const steps = arrivalJourney({ ...stay, nightBeforeFree: null });
  assert.equal(steps.some((step) => step.id === 'early'), false);
});

test('after checkout the trip is finished and the code step is done', () => {
  const steps = arrivalJourney({
    ...stay,
    asOf: '2026-11-08',
    phase: 'after',
    preferencesDone: true,
    nightBeforeFree: true,
  });
  assert.equal(steps.find((step) => step.id === 'agree')?.state, 'later');
  assert.equal(steps.find((step) => step.id === 'group')?.state, 'done');
  assert.equal(steps.find((step) => step.id === 'code')?.state, 'done');
  assert.equal(steps.find((step) => step.id === 'leave')?.state, 'done');
  assert.equal(steps.some((step) => step.id === 'early'), false);
});
