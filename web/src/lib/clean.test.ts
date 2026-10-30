import assert from 'node:assert/strict';
import test from 'node:test';
import type { Reservation } from './api.ts';
import { cleanJobs, cleanLabel, jobDoneCount, workOrderPlace, workOrderWhen } from './clean.ts';

function stay(partial: Partial<Reservation> & Pick<Reservation, 'id' | 'propertyId' | 'checkIn' | 'checkOut'>): Reservation {
  return { guestName: 'Guest', payout: 0, source: 'Airbnb', ...partial };
}

test('a same-day turn is first and asks for room photos', () => {
  const jobs = cleanJobs(
    [
      stay({ id: 'out', propertyId: 'ranch', checkIn: '2026-11-01', checkOut: '2026-11-04' }),
      stay({ id: 'in', propertyId: 'ranch', checkIn: '2026-11-04', checkOut: '2026-11-20' }),
      stay({ id: 'gap', propertyId: 'lindon', checkIn: '2026-11-01', checkOut: '2026-11-07' }),
      stay({ id: 'later', propertyId: 'lindon', checkIn: '2026-11-22', checkOut: '2026-11-24' }),
      stay({ id: 'nope', propertyId: 'river', checkIn: '2026-11-01', checkOut: '2026-11-03', status: 'cancelled' }),
    ],
    '2026-11-01',
  );
  assert.equal(jobs.length, 2);
  assert.equal(jobs[0]?.priority, true);
  assert.equal(jobs[0]?.steps[0]?.id, 'window');
  assert.equal(jobs[0]?.steps.some((step) => step.id === 'photos'), true);
  assert.equal(jobs[1]?.house, 'lindon');
  assert.equal(jobs[1]?.priority, false);
  assert.equal(jobs[1]?.gapNights, 15);
});

test('the photo line stays open until a room photo is attached', () => {
  const steps = [
    { id: 'beds' },
    { id: 'photos' },
  ];
  assert.equal(jobDoneCount(steps, { 'job:photos': true }, 'job', 0), 0);
  assert.equal(jobDoneCount(steps, { 'job:photos': true, 'job:beds': true }, 'job', 1), 2);
  assert.equal(cleanLabel('photos', 'es').includes('Foto'), true);
  assert.equal(cleanLabel('photos', 'en').includes('Photo'), true);
  assert.match(workOrderWhen('lindon', false, 'en'), /Checkout at 11:00 AM/);
  assert.match(workOrderWhen('ranch', true, 'en'), /next guest arrives at 4:00 PM/);
  assert.match(workOrderPlace('lindon', 'en'), /143 Harcliff Circle, Lindon, Utah 84042/);
  assert.match(workOrderPlace('lindon', 'en'), /Park in the driveway/);
  assert.match(workOrderPlace('river', 'es'), /Dirección: Vivian Park/);
  assert.equal(workOrderPlace('river', 'en').toLowerCase().includes('code'), false);
  assert.equal(workOrderPlace('ranch', 'en').includes('Wi-Fi'), false);
  assert.match(workOrderWhen('ranch', true, 'es'), /11:00 AM/);
});
