import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMarketBoard } from './board.ts';
import { runShadow } from './shadow.ts';

test('a booked night keeps the published rate even when comps are higher', () => {
  const board = buildMarketBoard('ranch', '2026-11-06', 3);
  const friday = board.nights[0]!;
  friday.action = 'raise';
  friday.proposedGuest = friday.ourGuest + 50;
  const run = runShadow(board, ['2026-11-06'], false, '2026-11-06');
  const guarded = run.nights[0]!;
  assert.equal(guarded.action, 'booked');
  assert.equal(guarded.proposedGuest, friday.ourGuest);
  assert.equal(run.counts.booked, 1);
  assert.match(run.digest, /Nothing sent to Hospitable/);
  assert.equal(run.digest.includes('guest'), false);
});

test('River nights before the first stay stay closed', () => {
  const board = buildMarketBoard('river', '2026-10-29', 3);
  const run = runShadow(board, [], false, '2026-10-29');
  assert.equal(run.nights.every((night) => night.action === 'closed'), true);
  assert.equal(run.counts.raise, 0);
});

test('pausing a house freezes every night', () => {
  const board = buildMarketBoard('lindon', '2026-11-06', 4);
  const run = runShadow(board, ['2026-11-06'], true, '2026-11-06');
  assert.equal(run.paused, true);
  assert.equal(run.nights.every((night) => night.action === 'paused' && night.proposedGuest === night.ourGuest), true);
  assert.match(run.digest, /Paused/);
});

test('an open night can still raise inside the cap', () => {
  const board = buildMarketBoard('ranch', '2026-11-06', 2);
  const open = board.nights[0]!;
  open.action = 'raise';
  open.proposedGuest = Math.round(open.ourGuest * 1.08);
  const run = runShadow(board, [], false, '2026-11-06');
  assert.equal(run.nights[0]?.action, 'raise');
  assert.ok(run.nights[0]!.proposedGuest <= Math.round(open.ourGuest * 1.08));
  assert.match(run.digest, /Largest raise/);
});
