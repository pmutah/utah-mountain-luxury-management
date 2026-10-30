import assert from 'node:assert/strict';
import test from 'node:test';
import { agentBrief } from './agent-brief.ts';

test('the night brief names the work and leaves the guest off it', () => {
  const lines = agentBrief({
    asOf: '2026-11-01',
    stays: [
      { id: 'same', propertyId: 'ranch', checkIn: '2026-10-28', checkOut: '2026-11-04', status: 'confirmed' },
      { id: 'next', propertyId: 'ranch', checkIn: '2026-11-04', checkOut: '2026-11-08' },
      { id: 'later', propertyId: 'lindon', checkIn: '2026-11-01', checkOut: '2026-11-07' },
      { id: 'gone', propertyId: 'river', checkIn: '2026-11-01', checkOut: '2026-11-03', status: 'cancelled' },
    ],
    shadowDays: 1,
    openJobs: 2,
    calendarReady: true,
  });
  const text = lines.map((line) => line.text).join('\n');
  assert.equal(text.includes('Guest'), false);
  assert.match(text, /Shadow day 1 of 7/);
  assert.match(text, /Hospitable write closed/);
  assert.match(text, /Same-day clean at Ranch on Nov 4/);
  assert.match(text, /Ranch: \d+ raises, \d+ promotions, [1-9]\d* booked left alone/);
  assert.match(text, /Nothing sent/);
  assert.equal(text.includes('$'), false);
  assert.match(text, /Lindon checkout Nov 7/);
  assert.equal(text.includes('River checkout'), false);
  assert.match(text, /Still open on our booking page: photos and card payment/);
  assert.match(text, /Door codes stay hidden/);
  assert.match(text, /2 shared jobs are open/);
  assert.match(text, /does not claim one/);
  assert.match(text, /does not change partner spend/);
});

test('seven shadow days still leave the write closed', () => {
  const lines = agentBrief({ asOf: '2026-11-01', stays: [], shadowDays: 9, openJobs: 0, calendarReady: true });
  const text = lines.map((line) => line.text).join('\n');
  assert.match(text, /Shadow days 7 of 7/);
  assert.match(text, /Hospitable write closed/);
  assert.match(text, /No checkouts in the next two weeks/);
  assert.match(text, /No shared jobs are open/);
});
