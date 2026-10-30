import assert from 'node:assert/strict';
import test from 'node:test';
import type { Reservation } from './api.ts';
import { cleanJobs, cleanLabel, jobDoneCount } from './clean.ts';

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
});
