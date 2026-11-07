import assert from 'node:assert/strict';
import test from 'node:test';
import { houseDay, houseDayNote, houseDayPaper } from './house-day.ts';

test('a day is composed from the published guide', () => {
  const ski = houseDay('river', 'ski');
  assert.equal(ski.title, 'A ski day');
  assert.match(ski.lines[0] ?? '', /Sundance Mountain Resort/);
  assert.match(ski.lines.join('\n'), /Tree Room/);
  assert.match(ski.lines.join('\n'), /Winter driving/);
  assert.equal(ski.lines.join('\n').includes('$'), false);
  assert.equal(/door\s*code|password/i.test(ski.lines.join('\n')), false);

  const out = houseDay('river', 'out');
  assert.match(out.lines[0] ?? '', /tubing|rafting|Provo River/i);
  assert.match(out.lines.join('\n'), /Groceries/);

  const riverSunday = houseDay('river', 'sunday');
  assert.match(riverSunday.lines.join('\n'), /Sunday brunch/);
  assert.equal(riverSunday.lines.join('\n').includes('$'), false);
  const ranchSunday = houseDay('ranch', 'sunday');
  assert.match(ranchSunday.lines.join('\n'), /close on Sundays/);
  assert.equal(ranchSunday.lines.join('\n').includes('$'), false);
  assert.equal(/\bthe house is open\b/i.test([...ski.lines, ...out.lines, ...ranchSunday.lines].join('\n')), false);
});

test('a quoted day does not call the house open', () => {
  const note = houseDayNote('quote');
  const paper = houseDayPaper(houseDay('river', 'ski'), 'quote');
  assert.match(note, /no price is quoted/);
  assert.match(note, /does not say the house is open/);
  assert.match(paper[paper.length - 1] ?? '', /It has no price/);
  assert.equal(paper.join('\n').includes('$'), false);
  assert.equal(houseDayNote('phone').includes('house is open'), false);
});
