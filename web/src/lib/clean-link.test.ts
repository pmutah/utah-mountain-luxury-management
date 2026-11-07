import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cleanJobLine,
  cleanJobView,
  cleanLinkPath,
  cleanPageNote,
  cleanSteps,
  isCleanToken,
  sortCleanJobs,
} from './clean-link.ts';

test('a clean token is 32 hex characters and the path carries it', () => {
  assert.equal(isCleanToken('a'.repeat(32)), true);
  assert.equal(isCleanToken('a'.repeat(31)), false);
  assert.equal(isCleanToken('A'.repeat(32)), false);
  assert.equal(isCleanToken(''), false);
  assert.equal(cleanLinkPath('abc'), '/clean/abc');
});

test('a clean job names the house and the day and never the guest or the code', () => {
  const job = cleanJobView({ house: 'river', checkout: '2026-11-14', gapNights: 2 });
  assert.ok(job);
  assert.equal(job.houseName, 'The River House');
  assert.equal(job.sameDay, false);
  const text = JSON.stringify(job);
  assert.equal(/door\s*code/i.test(text.replace(/door code stays on the guest phone/g, '')), false);
  assert.equal(text.includes('$'), false);
  assert.equal(/Ada|Lovelace/.test(text), false);
});

test('a same-day turn leads with the deadline', () => {
  const job = cleanJobView({ house: 'ranch', checkout: '2026-11-14', gapNights: 0 });
  assert.ok(job);
  assert.equal(job.sameDay, true);
  assert.match(job.steps[0] ?? '', /Same-day turn. Finish before 4pm/);
  assert.equal(job.steps.length, 7);
});

test('house rules are one line each with no repeats', () => {
  const job = cleanJobView({ house: 'river', checkout: '2026-11-14', gapNights: 1 })!;
  const joined = job.rules.join('|');
  assert.equal(new Set(job.rules).size, job.rules.length, 'a rule repeated on the cleaner page');
  assert.match(joined, /septic/);
  assert.match(joined, /dishwasher/i);
  assert.equal(job.rules.some((line) => /\bdoor\s*code\b/i.test(line)), false);
});

test('a normal turn has six steps and Spanish says the same thing', () => {
  assert.equal(cleanSteps(false).length, 6);
  const es = cleanSteps(true, 'es');
  assert.match(es[0] ?? '', /mismo día/);
  assert.equal(es.length, 7);
  assert.equal(cleanSteps(false)[0], 'Strip and remake every bed');
});

test('the job line reads like a list a cleaner can scan', () => {
  const gap = cleanJobView({ house: 'lindon', checkout: '2026-11-14', gapNights: 3 })!;
  assert.match(cleanJobLine(gap), /Sat, Nov 14 · The Lindon House · 3 nights before the next stay/);
  const one = cleanJobView({ house: 'lindon', checkout: '2026-11-14', gapNights: 1 })!;
  assert.match(cleanJobLine(one), /1 night before/);
  const same = cleanJobView({ house: 'lindon', checkout: '2026-11-14', gapNights: 0 })!;
  assert.match(cleanJobLine(same), /same-day turn, finish before 4pm/);
  const unread = cleanJobView({ house: 'lindon', checkout: '2026-11-14', gapNights: null })!;
  assert.match(cleanJobLine(unread), /The Lindon House$/);
  assert.equal(cleanJobLine(gap).includes('$'), false);
});

test('a bad checkout date is not a job', () => {
  assert.equal(cleanJobView({ house: 'river', checkout: 'not-a-day', gapNights: 1 }), null);
  assert.equal(cleanJobView({ house: 'river', checkout: '2026-13-01', gapNights: 1 }), null);
});

test('the page note counts same-day turns and never promises a code', () => {
  const jobs = [
    cleanJobView({ house: 'river', checkout: '2026-11-14', gapNights: 0 })!,
    cleanJobView({ house: 'ranch', checkout: '2026-11-15', gapNights: 2 })!,
  ];
  const note = cleanPageNote(jobs, false);
  assert.match(note, /2 turnovers in the next two weeks/);
  assert.match(note, /1 is a same-day turn/);
  assert.match(note, /door code stays on the guest phone/);
  assert.equal(note.includes('$'), false);
  assert.match(cleanPageNote([jobs[1]!], false), /1 turnover in the next two weeks\./);
  assert.match(cleanPageNote([], false), /No turnover in the next two weeks/);
  assert.match(cleanPageNote(jobs, true), /could not be read/);
});

test('jobs sort by day then house', () => {
  const jobs = [
    cleanJobView({ house: 'river', checkout: '2026-11-15', gapNights: 1 })!,
    cleanJobView({ house: 'ranch', checkout: '2026-11-14', gapNights: 1 })!,
    cleanJobView({ house: 'lindon', checkout: '2026-11-14', gapNights: 1 })!,
  ];
  assert.deepEqual(
    sortCleanJobs(jobs).map((job) => `${job.checkout}|${job.houseName}`),
    ['2026-11-14|The Lindon House', '2026-11-14|The Ranch House', '2026-11-15|The River House'],
  );
});
