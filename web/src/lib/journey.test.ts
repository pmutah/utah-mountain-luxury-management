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
  assert.equal(steps.find((step) => step.id === 'group')?.state, 'now');
  const code = steps.find((step) => step.id === 'code');
  assert.equal(code?.state, 'later');
  assert.match(code?.detail ?? '', /Nov 5/);
  const early = steps.find((step) => step.id === 'early');
  assert.equal(early?.state, 'now');
  assert.match(early?.detail ?? '', /door code still opens on Nov 5/);
  assert.equal(steps.find((step) => step.id === 'arrive')?.state, 'later');
});

test('a booked night before arrival hides the early offer', () => {
  const steps = arrivalJourney({ ...stay, nightBeforeFree: false });
  assert.equal(steps.some((step) => step.id === 'early'), false);
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
  assert.equal(steps.find((step) => step.id === 'group')?.state, 'done');
  assert.equal(steps.find((step) => step.id === 'code')?.state, 'done');
  assert.equal(steps.find((step) => step.id === 'leave')?.state, 'done');
  assert.equal(steps.some((step) => step.id === 'early'), false);
});
