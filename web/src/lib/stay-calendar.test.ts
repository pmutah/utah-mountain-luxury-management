import assert from 'node:assert/strict';
import test from 'node:test';
import { arrivalMinimum, monthDays, pickStay } from './stay-calendar.ts';

const open = { checkIn: '2026-11-06', checkOut: '2026-11-08' };

test('a booked night cannot start a stay, and a clear range can end on a booked morning', () => {
  const taken = ['2026-12-10', '2026-12-11', '2026-12-12'];
  const blocked = pickStay({ checkIn: '', checkOut: '' }, '2026-12-10', taken, 'river', '2026-10-29');
  assert.equal(blocked.checkIn, '');

  const started = pickStay({ checkIn: '', checkOut: '' }, '2026-12-08', taken, 'river', '2026-10-29');
  const finished = pickStay(started, '2026-12-10', taken, 'river', '2026-10-29');
  assert.deepEqual(finished, { checkIn: '2026-12-08', checkOut: '2026-12-10' });

  const across = pickStay(started, '2026-12-14', taken, 'river', '2026-10-29');
  assert.equal(across.checkOut, '');

  const tooShort = ['2026-11-20'];
  const cannotStart = pickStay({ checkIn: '', checkOut: '' }, '2026-11-19', tooShort, 'river', '2026-10-29');
  assert.equal(cannotStart.checkIn, '');
  const before = pickStay({ checkIn: '', checkOut: '' }, '2026-11-18', tooShort, 'river', '2026-10-29');
  const leaveOnBookedMorning = pickStay(before, '2026-11-20', tooShort, 'river', '2026-10-29');
  assert.deepEqual(leaveOnBookedMorning, { checkIn: '2026-11-18', checkOut: '2026-11-20' });
  const later = pickStay({ checkIn: '', checkOut: '' }, '2026-11-21', tooShort, 'river', '2026-10-29');
  const keepLater = pickStay(later, '2026-11-19', tooShort, 'river', '2026-10-29');
  assert.equal(keepLater.checkIn, '2026-11-21');
  assert.equal(keepLater.checkOut, '');
});

test('the month marks booked nights and the nights inside the stay', () => {
  const days = monthDays('2026-11', 'river', ['2026-11-20'], open, '2026-10-29');
  const sixth = days.find((day) => day.iso === '2026-11-06');
  const seventh = days.find((day) => day.iso === '2026-11-07');
  const eighth = days.find((day) => day.iso === '2026-11-08');
  const twentieth = days.find((day) => day.iso === '2026-11-20');
  assert.equal(sixth?.isCheckIn, true);
  assert.equal(sixth?.inStay, true);
  assert.equal(sixth?.guest, 2486);
  assert.equal(sixth?.direct, 2100);
  assert.equal(seventh?.inStay, true);
  assert.equal(eighth?.isCheckOut, true);
  assert.equal(eighth?.inStay, false);
  assert.equal(twentieth?.booked, true);
  assert.equal(sixth?.minNights, 2);
  assert.equal(sixth?.startNights, 2);
  assert.equal(twentieth?.startNights, null);
  const beforeBooked = days.find((day) => day.iso === '2026-11-19');
  assert.equal(beforeBooked?.startNights, null);
  const ranchFriday = monthDays('2026-11', 'ranch', [], { checkIn: '', checkOut: '' }, '2026-10-29').find((day) => day.iso === '2026-11-06');
  const ranchWeekday = monthDays('2026-11', 'ranch', [], { checkIn: '', checkOut: '' }, '2026-10-29').find((day) => day.iso === '2026-11-04');
  const ranchSoon = monthDays('2026-11', 'ranch', [], { checkIn: '', checkOut: '' }, '2026-11-01').find((day) => day.iso === '2026-11-06');
  assert.equal(ranchFriday?.minNights, 1);
  assert.equal(ranchFriday?.startNights, 2);
  assert.equal(ranchWeekday?.startNights, 1);
  assert.equal(ranchSoon?.startNights, 1);
  const holiday = monthDays('2026-11', 'river', [], open, '2026-10-29').find((day) => day.iso === '2026-11-24');
  assert.equal(holiday?.startNights, 4);
  const october = monthDays('2026-10', 'river', [], open, '2026-10-29').find((day) => day.iso === '2026-10-30');
  assert.equal(october?.closed, true);
  const peak = monthDays('2027-06', 'river', [], open, '2026-10-29').find((day) => day.iso === '2027-06-04');
  assert.equal(peak?.minNights, 4);
  assert.equal(arrivalMinimum('river', '2026-11-06'), 2);
  assert.equal(arrivalMinimum('river', '2026-10-30'), null);
  assert.equal(arrivalMinimum('lindon', '2026-11-04'), null);
});
