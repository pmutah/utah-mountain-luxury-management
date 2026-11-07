import assert from 'node:assert/strict';
import test from 'node:test';
import { jobLeaveAt2, noteArrivesAt1, noteLeavesAt2, standingTurnLine, stepText, turnHours } from './turn-clock.ts';

test('a same-day turn counts the hours', () => {
  assert.deepEqual(turnHours({ sameDay: true, leaveAt2: false, arriveAt1: false }), {
    hours: 5,
    text: '5 hours, from 11:00 AM to 4:00 PM.',
  });
  assert.deepEqual(turnHours({ sameDay: true, leaveAt2: false, arriveAt1: true }), {
    hours: 2,
    text: '2 hours, from 11:00 AM to 1:00 PM.',
  });
  assert.deepEqual(turnHours({ sameDay: true, leaveAt2: true, arriveAt1: false }), {
    hours: 2,
    text: '2 hours, from 2:00 PM to 4:00 PM.',
  });
  assert.equal(turnHours({ sameDay: true, leaveAt2: true, arriveAt1: true }).text, '2 hours, from 11:00 AM to 1:00 PM.');
  assert.equal(turnHours({ sameDay: false, leaveAt2: false, arriveAt1: false }).hours, null);
  assert.match(turnHours({ sameDay: false, leaveAt2: true, arriveAt1: false }).text, /starts at 2:00 PM/);
  const standing = standingTurnLine('en');
  assert.match(standing, /5 hours, from 11:00 AM to 4:00 PM/);
  assert.match(standing, /makes it 2 hours/);
  assert.match(standing, /does not say that anyone asked/);
  assert.equal(standing.includes('$'), false);
  const spanish = standingTurnLine('es');
  assert.match(spanish, /5 horas, de 11:00 AM a 4:00 PM/);
  assert.match(spanish, /2 horas/);
  assert.match(spanish, /no dice que alguien lo pidió/);
  assert.equal(noteArrivesAt1('Add-on request: Arrive at 1:00 PM. Nothing is charged yet.'), true);
  assert.equal(noteArrivesAt1('Arrival around 6:00 PM.'), false);
  assert.equal(noteLeavesAt2('Leave at 2:00 PM. Nothing is charged yet.'), true);
  assert.equal(jobLeaveAt2('11:00 AM', true), false);
  assert.equal(jobLeaveAt2('2:00 PM', false), true);
  assert.equal(jobLeaveAt2(undefined, true), true);
  assert.equal(
    stepText('window', 'Same-day turn. Finish before 4pm.', '2 hours, from 11:00 AM to 1:00 PM.'),
    '2 hours, from 11:00 AM to 1:00 PM.',
  );
  assert.equal(stepText('beds', 'Strip and remake every bed', '5 hours, from 11:00 AM to 4:00 PM.'), 'Strip and remake every bed');
});
