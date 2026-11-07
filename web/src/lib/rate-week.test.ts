import assert from 'node:assert/strict';
import test from 'node:test';
import { ownerRateWeek, ownerRateWeekNote, rateCardHouses, rateCardHousesNote, rateCardWeek } from './rate-week.ts';

test('the next seven nights stay unraised and do not name a price', () => {
  const river = rateCardWeek('river', '2026-10-30');
  assert.equal(river.length, 7);
  assert.match(river[0] ?? '', /Oct 30/);
  assert.match(river[0] ?? '', /Not yet/);
  assert.match(river[0] ?? '', /Arizona State/);
  assert.match(river[2] ?? '', /Nov 1/);
  assert.match(river[2] ?? '', /2 nights/);
  assert.equal((river[2] ?? '').includes('Not yet'), false);
  const text = river.join('\n').replace(/does not say which nights are booked or open/g, '');
  assert.equal(text.includes('$'), false);
  assert.equal(/\bopen\b/i.test(text), false);
  assert.match(text, /Nothing is raised/);
  assert.match(text, /Nothing is posted/);
});

test('the same week names every house and does not name a price', () => {
  const week = rateCardHouses('2026-10-30');
  const note = rateCardHousesNote();
  assert.equal(week.length, 7);
  assert.match(week[0] ?? '', /Oct 30/);
  assert.match(week[0] ?? '', /River: not yet/);
  assert.match(week[0] ?? '', /Ranch:/);
  assert.match(week[0] ?? '', /Lindon:/);
  assert.match(week[2] ?? '', /Nov 1/);
  assert.equal((week[2] ?? '').includes('River: not yet'), false);
  const text = [...week, note].join('\n');
  assert.equal(text.includes('$'), false);
  assert.match(note, /does not say which nights are booked or open/);
  assert.equal(week.join('\n').includes('open'), false);
  assert.match(text, /Nothing is raised/);
  assert.match(text, /Nothing is posted/);
});

test('Todd’s week is Ranch and River only', () => {
  const week = ownerRateWeek('2026-10-30');
  const note = ownerRateWeekNote();
  assert.equal(week.length, 7);
  assert.match(week[0] ?? '', /Ranch:/);
  assert.match(week[0] ?? '', /River: not yet/);
  assert.equal(week.join('\n').includes('Lindon'), false);
  assert.equal(week.join('\n').includes('$'), false);
  assert.equal(week.join('\n').includes('open'), false);
  assert.match(note, /Lindon is not on this page/);
  assert.match(note, /does not say which nights are booked or open/);
  const marked = ownerRateWeek('2026-10-30', {
    taken: { ranch: ['2026-10-30', '2026-10-31'] },
    closed: { ranch: ['2026-10-31'] },
  });
  assert.match(marked[0] ?? '', /Ranch: booked/);
  assert.match(marked[1] ?? '', /Ranch: closed/);
  const onlyClosed = ownerRateWeek('2026-10-30', {
    taken: { ranch: ['2026-10-30'] },
    closed: { ranch: ['2026-10-31'] },
  });
  assert.match(onlyClosed[1] ?? '', /Ranch: closed/);
  const stopped = ownerRateWeek('2026-10-30', {
    taken: { river: ['2026-11-02'] },
    closed: {},
  });
  assert.match(stopped[2] ?? '', /River: no start/);
  assert.equal((stopped[2] ?? '').includes('$'), false);
  assert.equal(/\bopen\b/i.test(stopped[2] ?? ''), false);
  const stoppedClosed = ownerRateWeek('2026-10-30', {
    taken: {},
    closed: { river: ['2026-11-02'] },
  });
  assert.match(stoppedClosed[2] ?? '', /River: no start/);
  assert.equal((stoppedClosed[2] ?? '').includes('$'), false);
  assert.equal((onlyClosed[1] ?? '').includes('$'), false);
  const lindon = rateCardHouses('2026-10-30', {
    taken: {},
    closed: { lindon: ['2026-10-31'] },
  });
  assert.match(lindon[1] ?? '', /Lindon: closed/);
  assert.equal((lindon[1] ?? '').includes('$'), false);
  assert.equal((marked[0] ?? '').includes('Lindon'), false);
  assert.match(ownerRateWeekNote(true), /Booked nights and calendar blocks are marked/);
  assert.equal(ownerRateWeekNote(true).includes('open'), false);
});
