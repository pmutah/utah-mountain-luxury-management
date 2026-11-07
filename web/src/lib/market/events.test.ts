import assert from 'node:assert/strict';
import test from 'node:test';
import { eventLine, eventNameOn, eventsTouchingMonth, nextEventLine, nextStayEventLine, stayEventLine } from './events.ts';

test('a month names the rate-card events that touch it and leaves the price off', () => {
  const october = eventsTouchingMonth('2026-10').map((event) => event.name);
  assert.ok(october.includes('BYU vs Arizona State'));
  assert.equal(october.includes('BYU at Utah'), false);
  const november = eventLine('2026-11');
  assert.match(november, /Thanksgiving and BYU vs Cincinnati, Nov 25–28/);
  assert.match(november, /BYU at Utah, Nov 6–7/);
  assert.equal(eventLine('2027-06'), 'No named event this month.');
  assert.equal(eventLine('2026-11').includes('$'), false);
  assert.equal(eventLine('2027-01').includes('Sundance'), false);
  assert.equal(stayEventLine('2026-11-01', '2026-11-03'), null);
  assert.equal(
    stayEventLine('2026-11-25', '2026-11-29'),
    'This stay covers Thanksgiving and BYU vs Cincinnati. Nothing extra is added for that.',
  );
  assert.equal(stayEventLine('2026-11-06', '2026-11-09'), 'This stay covers BYU at Utah. Nothing extra is added for that.');
  assert.match(nextEventLine('2026-10-30'), /^Next named event: BYU vs Arizona State, Oct 30–31/);
  assert.equal(nextEventLine('2026-10-30').includes('$'), false);
  assert.match(nextEventLine('2027-03-01'), /^No named event in the next 90 days/);
  assert.equal(nextEventLine('2027-01-10').includes('Sundance'), false);
  assert.equal(eventNameOn('2026-11-06'), 'BYU at Utah');
  assert.equal(eventNameOn('2026-11-08'), null);
  assert.equal(
    nextStayEventLine('2026-11-04', '2026-11-20'),
    'The next stay covers BYU at Utah and BYU vs Baylor. Nothing extra is added for that.',
  );
  assert.equal(nextStayEventLine('2026-11-01', '2026-11-03'), null);
});
