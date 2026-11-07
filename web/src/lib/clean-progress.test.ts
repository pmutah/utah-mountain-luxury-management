import assert from 'node:assert/strict';
import test from 'node:test';
import {
  houseReady,
  keepDone,
  openSteps,
  progressKey,
  progressSummary,
  stepIds,
  stepRows,
  turnState,
  turnStateLine,
} from './clean-progress.ts';

test('a same-day turn has one more step than a normal turn', () => {
  assert.deepEqual(stepIds(false), ['beds', 'linens', 'kitchen', 'baths', 'floors', 'photos']);
  assert.deepEqual(stepIds(true), ['window', 'beds', 'linens', 'kitchen', 'baths', 'floors', 'photos']);
  assert.equal(stepRows(false).length, 6);
  assert.equal(stepRows(true).length, 7);
  assert.equal(stepRows(false)[0]!.id, 'beds');
  assert.match(stepRows(false, 'es')[0]!.label, /Quitar y volver a hacer/);
});

test('only ids this turn actually has are kept', () => {
  const kept = keepDone('river', '2026-11-14', false, ['beds', 'beds', 'window', 'made-up', 42]);
  assert.ok(kept);
  assert.deepEqual(kept.done, ['beds']);
  // `window` belongs to a same-day turn, so a normal turn drops it.
  assert.equal(kept.done.includes('window'), false);
  assert.equal(keepDone('river', 'not-a-day', false, ['beds']), null);
  assert.equal(keepDone('river', '2026-13-01', false, ['beds']), null);
});

test('a turn reads as none, started, or done', () => {
  const none = keepDone('river', '2026-11-14', false, [])!;
  assert.equal(turnState('river', '2026-11-14', false, [none]), 'none');
  assert.equal(turnState('river', '2026-11-14', false, []), 'none');

  const started = keepDone('river', '2026-11-14', false, ['beds', 'linens'])!;
  assert.equal(turnState('river', '2026-11-14', false, [started]), 'started');
  assert.equal(openSteps('river', '2026-11-14', false, [started]), 4);

  const all = keepDone('river', '2026-11-14', false, stepIds(false))!;
  assert.equal(turnState('river', '2026-11-14', false, [all]), 'done');
  assert.equal(openSteps('river', '2026-11-14', false, [all]), 0);
  assert.equal(houseReady('river', '2026-11-14', false, [all]), true);
  assert.equal(houseReady('river', '2026-11-14', false, [started]), false);
});

test('one house progress does not mark another house done', () => {
  const river = keepDone('river', '2026-11-14', false, stepIds(false))!;
  assert.equal(turnState('ranch', '2026-11-14', false, [river]), 'none');
  assert.equal(turnState('river', '2026-11-15', false, [river]), 'none');
});

test('the host line never claims more than the ticks show', () => {
  const all = keepDone('lindon', '2026-11-19', true, stepIds(true))!;
  assert.match(turnStateLine('lindon', '2026-11-19', true, [all]), /marked this turn done/);
  const some = keepDone('lindon', '2026-11-19', true, ['window', 'beds'])!;
  assert.match(turnStateLine('lindon', '2026-11-19', true, [some]), /has started this turn\. 5 steps are still open/);
  const one = keepDone('lindon', '2026-11-19', false, ['beds', 'linens', 'kitchen', 'baths', 'floors'])!;
  assert.match(turnStateLine('lindon', '2026-11-19', false, [one]), /1 step is still open/);
  assert.match(turnStateLine('lindon', '2026-11-19', true, []), /No step is ticked yet/);
  assert.equal(turnStateLine('lindon', '2026-11-19', true, []).includes('$'), false);
});

test('the desk summary counts done, started, and untouched turns', () => {
  const turns = [
    { house: 'river' as const, checkout: '2026-11-14', sameDay: false },
    { house: 'ranch' as const, checkout: '2026-11-16', sameDay: true },
    { house: 'lindon' as const, checkout: '2026-11-19', sameDay: false },
  ];
  const progress = [
    keepDone('river', '2026-11-14', false, stepIds(false))!,
    keepDone('ranch', '2026-11-16', true, ['window'])!,
  ];
  const line = progressSummary(turns, progress);
  assert.match(line, /1 turnover is done/);
  assert.match(line, /1 is in progress/);
  assert.match(line, /1 has no step ticked/);
  assert.match(line, /ticks these on their own link/);
  assert.match(progressSummary(turns, []), /No turnover is marked done/);
  assert.match(progressSummary([], []), /No turnover to track/);
});

test('the progress key is stable and readable', () => {
  assert.equal(progressKey('river', '2026-11-14'), 'river:2026-11-14');
});

test('a tick survives a translated label because it is keyed by id', () => {
  const en = stepRows(false, 'en');
  const es = stepRows(false, 'es');
  assert.deepEqual(
    en.map((row) => row.id),
    es.map((row) => row.id),
  );
  assert.notEqual(en[0]!.label, es[0]!.label);
});
