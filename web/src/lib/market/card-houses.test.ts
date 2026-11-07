import assert from 'node:assert/strict';
import test from 'node:test';
import { judgeHousesOnCard } from './card-houses.ts';

test('one ask is judged on every house and does not name a price', () => {
  const early = judgeHousesOnCard('2026-10-30', '2026-10-30', 1);
  assert.equal(early.length, 3);
  assert.match(early[0] ?? '', /River: Not yet/);
  assert.match(early[1] ?? '', /Ranch:/);
  assert.match(early[2] ?? '', /Lindon:/);
  const later = judgeHousesOnCard('2026-10-30', '2026-11-13', 1);
  assert.equal(later.length, 3);
  assert.match(later.join('\n'), /River:/);
  assert.match(later.join('\n'), /does not say the night is booked or open/);
  assert.match(later.join('\n'), /Nothing is posted/);
  assert.match(later[0] ?? '', /at least 2 nights/);
  assert.match(later[1] ?? '', /both weekend nights/);
  assert.match(later[2] ?? '', /both weekend nights/);
  const text = [...early, ...later].join('\n');
  assert.equal(text.includes('$'), false);
  assert.equal(judgeHousesOnCard('2026-10-30', 'bad', 1).length, 0);
});
