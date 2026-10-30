import assert from 'node:assert/strict';
import test from 'node:test';
import { occupancyCalendar, occupancyFilename } from './occupancy-calendar.ts';

test('the occupancy file lists taken nights and leaves the guest off it', () => {
  const file = occupancyCalendar(
    [
      {
        propertyId: 'ranch',
        checkIn: '2026-11-04',
        checkOut: '2026-11-06',
        status: 'confirmed',
        guestName: 'Secret Guest',
        payout: 9999,
      } as never,
      { propertyId: 'river', checkIn: '2026-10-01', checkOut: '2026-10-03', status: 'confirmed' },
      { propertyId: 'lindon', checkIn: '2026-11-01', checkOut: '2026-11-02', status: 'cancelled' },
      { propertyId: 'river', checkIn: '2026-12-01', checkOut: '2026-12-03', status: 'blocked' },
      { propertyId: 'ranch', checkIn: '2026-11-04', checkOut: '2026-11-06', status: 'confirmed' },
    ],
    '2026-10-29',
  );
  assert.equal(file.includes('Secret'), false);
  assert.equal(file.includes('9999'), false);
  assert.equal(file.includes('Lindon'), false);
  assert.equal(file.includes('20261001'), false);
  assert.match(file, /SUMMARY:Ranch unavailable/);
  assert.match(file, /SUMMARY:River unavailable/);
  assert.match(file, /DTSTART;VALUE=DATE:20261104/);
  assert.match(file, /DTEND;VALUE=DATE:20261106/);
  assert.match(file, /UID:ranch-2026-11-04-2026-11-06@uml/);
  assert.match(file, /UID:ranch-2026-11-04-2026-11-06-2@uml/);
  assert.equal(occupancyFilename(), 'uml-occupancy.ics');
  assert.equal(file.endsWith('END:VCALENDAR\r\n'), true);
});
