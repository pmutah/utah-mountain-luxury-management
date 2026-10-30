import assert from 'node:assert/strict';
import test from 'node:test';
import { arrivalJourney, nightBeforeIsFree } from './journey.ts';

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
