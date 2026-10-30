import assert from 'node:assert/strict';
import test from 'node:test';
import { agentBrief } from './agent-brief.ts';

test('the night brief names the work and leaves the guest off it', () => {
  const lines = agentBrief({
    asOf: '2026-11-01',
    stays: [
      { id: 'same', propertyId: 'ranch', checkIn: '2026-10-28', checkOut: '2026-11-04', status: 'confirmed', source: 'Airbnb' },
      {
        id: 'next',
        propertyId: 'ranch',
        checkIn: '2026-11-04',
        checkOut: '2026-11-08',
        source: 'VRBO',
        note: 'Ada Lovelace · 9 guests · 801-555-0100',
      },
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
  assert.match(text, /Where they booked: 1 Airbnb, 1 VRBO/);
  assert.match(text, /Open stretch on the calendar: Ranch Nov 8 for \d+ nights\. River Nov 1 for 120 nights/);
  assert.match(text, /Next open arrival from these bookings: River Nov 1 for 2 nights\. Ranch Nov 8 for 1 night\. Lindon Nov 7 for 1 night\./);
  assert.match(text, /Length choices from these bookings: River Nov 1 can quote 2, 3, 4, 7, 14, 28 nights\. Ranch Nov 8 can quote 1, 2, 3, 4, 7, 14, 28 nights\. Lindon Nov 7 can quote /);
  assert.match(text, /Add-ons from these bookings: River Nov 1 can request a later checkout\. Ranch Nov 8 can request a later checkout and the hot tub\. Lindon Nov 7 can request a later checkout\./);
  assert.match(text, /Booking calendar from these bookings:.*Nov 23 starts at 4 nights/);
  assert.match(text, /weekend nights show 2 nights/);
  assert.match(text, /Other houses from these bookings:/);
  assert.equal(text.split('\n').find((line) => line.includes('Other houses from these bookings:'))?.includes('$') ?? false, false);
  assert.match(text, /Same-day clean at Ranch on Nov 4\. Checkout at 11:00 AM\. The next guest arrives at 4:00 PM\./);
  assert.match(text, /The next stay starts November 4, 2026\. The door code opens November 3, 2026/);
  assert.match(text, /The next stay is for 9 guests\. Names stay off this list\./);
  assert.equal(text.includes('Ada'), false);
  assert.equal(text.includes('801'), false);
  assert.match(text, /No next stay is on the calendar/);
  assert.match(text, /Ranch: \d+ raises, \d+ promotions, [1-9]\d* booked left alone/);
  assert.match(text, /Nothing sent/);
  assert.equal(text.includes('$'), false);
  assert.match(text, /Lindon checkout Nov 7\..*Checkout at 11:00 AM\./);
  assert.match(text, /Before checkout the guest was asked to start the dishwasher/);
  assert.equal(text.includes('River checkout'), false);
  assert.match(text, /Still open on our booking page: photos and card payment/);
  assert.match(text, /No door code opens on the guest phone tomorrow/);
  assert.match(text, /Door codes stay hidden/);
  assert.match(text, /Nothing here signs it/);
  assert.match(text, /printed trip sheet leaves the code/);
  assert.match(text, /keeps the house notes and the house rules/);
  assert.match(text, /2 shared jobs are open/);
  assert.match(text, /does not claim one/);
  assert.match(text, /does not change partner spend/);
  const withFix = agentBrief({
    asOf: '2026-11-01',
    stays: [],
    shadowDays: 1,
    openJobs: 0,
    calendarReady: true,
    fixes: [{ id: 'job', house: 'Lindon', checkout: '2026-11-07', note: 'Hot tub cover is loose.' }],
  });
  assert.match(withFix.map((line) => line.text).join('\n'), /Lindon checkout Nov 7: Hot tub cover is loose/);
  const held = agentBrief({
    asOf: '2026-11-01',
    stays: [],
    shadowDays: 1,
    openJobs: 0,
    calendarReady: true,
    closed: [{ propertyId: 'river', start: '2026-11-01', end: '2026-11-03' }],
  });
  const heldText = held.map((line) => line.text).join('\n');
  assert.match(heldText, /Open stretch on the calendar: Ranch Nov 1 for 120 nights\. River Nov 3 for 118 nights/);
  assert.match(heldText, /Next open arrival from these bookings: River Nov 3 for 2 nights\. Ranch Nov 1 for 1 night\. Lindon Nov 1 for 1 night/);
  assert.match(heldText, /River Nov 3 can quote 2, 3, 4, 7, 14, 28 nights/);
  assert.match(heldText, /River Nov 3 can request a later checkout and a grocery drop/);
  assert.match(heldText, /Nothing still on the books/);
  assert.equal(heldText.includes('$'), false);
});

test('seven shadow days still leave the write closed', () => {
  const lines = agentBrief({ asOf: '2026-11-01', stays: [], shadowDays: 9, openJobs: 0, calendarReady: true });
  const text = lines.map((line) => line.text).join('\n');
  assert.match(text, /Shadow days 7 of 7/);
  assert.match(text, /Hospitable write closed/);
  assert.match(text, /No checkouts in the next two weeks/);
  assert.match(text, /Nothing still on the books/);
  assert.match(text, /Open stretch on the calendar: Ranch Nov 1 for 120 nights\. River Nov 1 for 120 nights/);
  assert.match(text, /Next open arrival from these bookings: River Nov 1 for 2 nights\. Ranch Nov 1 for 1 night\. Lindon Nov 1 for 1 night\./);
  assert.match(
    text,
    /Length choices from these bookings: River Nov 1 can quote 2, 3, 4, 7, 14, 28 nights\. Ranch Nov 1 can quote 1, 2, 3, 4, 7, 14, 28 nights\. Lindon Nov 1 can quote 1, 2, 3, 4, 7, 14, 28 nights/,
  );
  assert.match(
    text,
    /Add-ons from these bookings: River Nov 1 can request a later checkout\. Ranch Nov 1 can request a later checkout\. Lindon Nov 1 can request a later checkout\./,
  );
  assert.match(text, /No shared jobs are open/);
});
