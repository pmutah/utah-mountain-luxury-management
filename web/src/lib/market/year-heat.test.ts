import assert from 'node:assert/strict';
import test from 'node:test';
import { compsFor } from './fixtures.ts';
import { yearHeat } from './year-heat.ts';

test('the year marks booked and closed nights and does not print a price', () => {
  const months = yearHeat('river', '2026-10-30', ['2026-11-05'], ['2026-11-06'], compsFor('river'));
  assert.equal(months.length, 12);
  assert.equal(months[0]?.month, '2026-10');
  assert.equal(months[11]?.month, '2027-09');
  const october = months[0]!;
  const november = months[1]!;
  assert.equal(october.days.find((day) => day.date === '2026-10-30')?.kind, 'closed');
  assert.equal(november.days.find((day) => day.date === '2026-11-05')?.kind, 'booked');
  assert.equal(november.days.find((day) => day.date === '2026-11-06')?.kind, 'closed');
  assert.equal(
    november.booked + november.closed + november.open + november.above + november.below,
    november.days.length,
  );
  assert.equal(months.some((month) => month.line.includes('$') || month.events.includes('$')), false);
  assert.match(october.events, /BYU vs Arizona State/);
  assert.match(november.events, /Thanksgiving and BYU vs Cincinnati/);
  assert.equal(october.minimum, 'No stay starts this month.');
  assert.match(november.minimum, /at least 2 nights/);
  assert.match(november.minimum, /Some nights ask for 4/);
  assert.equal(november.minimum.includes('$'), false);
  assert.equal(months.find((month) => month.month === '2027-06')?.events, 'No named event this month.');
  const openish = november.days.filter((day) => day.kind === 'above' || day.kind === 'below' || day.kind === 'open');
  assert.ok(openish.length > 0);
});
