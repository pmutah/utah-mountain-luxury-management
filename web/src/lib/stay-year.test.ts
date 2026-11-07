import assert from 'node:assert/strict';
import test from 'node:test';
import { stayYear } from './stay-year.ts';

test('the house year marks booked and closed nights and leaves a blank night unquoted', () => {
  const months = stayYear('river', '2026-11-04', ['2026-12-10', '2026-12-11', '2026-12-12', '2026-12-24'], ['2026-12-24']);
  assert.equal(months.length, 12);
  assert.equal(months[0]?.month, '2026-11');
  assert.equal(months[11]?.month, '2027-10');
  const december = months.find((month) => month.month === '2026-12');
  assert.ok(december);
  assert.equal(december.days.find((day) => day.date === '2026-12-10')?.kind, 'booked');
  assert.equal(december.days.find((day) => day.date === '2026-12-24')?.kind, 'closed');
  assert.equal(december.days.find((day) => day.date === '2026-12-01')?.kind, 'plain');
  assert.equal(december.booked, 3);
  assert.equal(december.closed, 1);
  assert.match(december.line, /3 booked\. 1 closed\./);
  assert.match(december.line, /still needs a quote/);
  assert.equal(december.line.includes('$'), false);
  assert.equal(/\bopen\b/.test(december.line), false);

  const early = stayYear('river', '2026-10-15', [], []);
  const october = early[0];
  assert.equal(october?.days.find((day) => day.date === '2026-10-31')?.kind, 'closed');
  assert.equal(early[1]?.days.find((day) => day.date === '2026-11-01')?.kind, 'plain');
  assert.equal(october?.line.includes('$'), false);
});
