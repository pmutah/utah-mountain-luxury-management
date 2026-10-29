import assert from 'node:assert/strict';
import test from 'node:test';
import { monthDays, pickStay } from './stay-calendar.ts';

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
  assert.equal(seventh?.inStay, true);
  assert.equal(eighth?.isCheckOut, true);
  assert.equal(eighth?.inStay, false);
  assert.equal(twentieth?.booked, true);
});
