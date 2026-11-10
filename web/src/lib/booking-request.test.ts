import assert from 'node:assert/strict';
import test from 'node:test';
import { bookingRequestHold } from './booking-request.ts';

const asOf = '2026-10-31';

test('a request the quote would refuse is not saved', () => {
  const earlyRiver = bookingRequestHold({
    propertyId: 'river',
    checkIn: '2026-10-31',
    checkOut: '2026-11-02',
    stays: [],
    asOf,
  });
  assert.match(earlyRiver ?? '', /first stays on November 1, 2026/);
  assert.equal((earlyRiver ?? '').includes('$'), false);

  const booked = bookingRequestHold({
    propertyId: 'ranch',
    checkIn: '2026-11-25',
    checkOut: '2026-11-27',
    stays: [{ propertyId: 'ranch', checkIn: '2026-11-25', checkOut: '2026-11-29', status: 'confirmed' }],
    asOf,
  });
  assert.match(booked ?? '', /already booked/);
  assert.equal((booked ?? '').includes('$'), false);

  const cancelled = bookingRequestHold({
    propertyId: 'ranch',
    checkIn: '2026-11-16',
    checkOut: '2026-11-18',
    stays: [{ propertyId: 'ranch', checkIn: '2026-11-16', checkOut: '2026-11-18', status: 'cancelled' }],
    asOf,
    guests: 4,
  });
  assert.equal(cancelled, null);
  const unnamed = bookingRequestHold({
    propertyId: 'ranch',
    checkIn: '2026-11-16',
    checkOut: '2026-11-18',
    stays: [],
    asOf,
  });
  assert.equal(unnamed, 'Add the number of overnight guests.');
  const zeroGuests = bookingRequestHold({
    propertyId: 'ranch',
    checkIn: '2026-11-16',
    checkOut: '2026-11-18',
    stays: [],
    asOf,
    guests: 0,
  });
  assert.equal(zeroGuests, 'Add the number of overnight guests.');
  const otherPair = bookingRequestHold({
    propertyId: 'river',
    alsoPropertyId: 'lindon',
    checkIn: '2026-11-16',
    checkOut: '2026-11-18',
    stays: [],
    asOf,
    guests: 50,
  });
  assert.equal(otherPair, 'Both houses on one request are the River House and the Ranch House.');
  assert.equal((otherPair ?? '').includes('$'), false);

  const closed = bookingRequestHold({
    propertyId: 'ranch',
    checkIn: '2026-11-16',
    checkOut: '2026-11-18',
    stays: [],
    blocks: [{ propertyId: 'ranch', checkIn: '2026-11-16', checkOut: '2026-11-18' }],
    asOf,
  });
  assert.match(closed ?? '', /closed on the calendar/);
  assert.equal((closed ?? '').includes('already booked'), false);

  const party = bookingRequestHold({
    propertyId: 'ranch',
    checkIn: '2026-11-16',
    checkOut: '2026-11-18',
    stays: [],
    asOf,
    guests: 30,
  });
  assert.match(party ?? '', /sleeps 20/);

  const children = bookingRequestHold({
    propertyId: 'ranch',
    checkIn: '2026-11-16',
    checkOut: '2026-11-18',
    stays: [],
    asOf,
    guests: 4,
    children: 4,
  });
  assert.match(children ?? '', /needs an adult/);

  const both = bookingRequestHold({
    propertyId: 'river',
    alsoPropertyId: 'ranch',
    checkIn: '2026-11-16',
    checkOut: '2026-11-18',
    stays: [],
    asOf,
    guests: 30,
  });
  assert.equal(both, null);
  const tooMany = bookingRequestHold({
    propertyId: 'river',
    alsoPropertyId: 'ranch',
    checkIn: '2026-11-16',
    checkOut: '2026-11-18',
    stays: [],
    asOf,
    guests: 50,
  });
  assert.match(tooMany ?? '', /together sleep 42/);
  assert.equal((tooMany ?? '').includes('$'), false);
  const onlyChildren = bookingRequestHold({
    propertyId: 'river',
    alsoPropertyId: 'ranch',
    checkIn: '2026-11-16',
    checkOut: '2026-11-18',
    stays: [],
    asOf,
    guests: 30,
    children: 30,
  });
  assert.match(onlyChildren ?? '', /needs an adult/);
  const oneHouse = bookingRequestHold({
    propertyId: 'river',
    alsoPropertyId: 'ranch',
    checkIn: '2026-11-16',
    checkOut: '2026-11-18',
    stays: [],
    asOf,
    guests: 4,
  });
  assert.equal(oneHouse, 'This party fits one house.');

  const bothBooked = bookingRequestHold({
    propertyId: 'river',
    alsoPropertyId: 'ranch',
    checkIn: '2026-11-25',
    checkOut: '2026-11-29',
    stays: [{ propertyId: 'ranch', checkIn: '2026-11-25', checkOut: '2026-11-29', status: 'confirmed' }],
    asOf,
  });
  assert.match(bothBooked ?? '', /Ranch: Those nights are already booked/);
  assert.equal(bookingRequestHold({ propertyId: 'ranch', checkIn: '2026-11-18', checkOut: '2026-11-16', stays: [], asOf }), 'This stay is not quoted.');
});
