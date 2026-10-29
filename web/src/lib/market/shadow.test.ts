import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMarketBoard } from './board.ts';
import { runShadow, portfolioDigest } from './shadow.ts';

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

test('a short year can promote an open weekend without cutting the base', () => {
  const board = buildMarketBoard('ranch', '2026-11-06', 1);
  const before = board.nights[0]!.proposedGuest;
  const run = runShadow(board, [], false, '2026-11-06', 'short');
  const night = run.nights[0]!;
  assert.equal(night.action, 'promote');
  assert.equal(night.proposedGuest, before);
  assert.equal(night.promotionPercent, 20);
  assert.ok(night.offerGuest < night.proposedGuest);
  assert.ok(night.offerGuest >= night.floorGuest);
});

test('a booked night is not promoted', () => {
  const board = buildMarketBoard('ranch', '2026-11-06', 1);
  const run = runShadow(board, ['2026-11-06'], false, '2026-11-06', 'short');
  assert.equal(run.nights[0]?.action, 'booked');
  assert.equal(run.nights[0]?.promotionPercent, 0);
});

test('the daily text names every house and leaves a paused house alone', () => {
  const text = portfolioDigest({
    asOf: '2026-10-29',
    taken: { river: [], ranch: ['2026-11-06'], lindon: [] },
    paused: { river: true, ranch: false, lindon: false },
    pace: { river: 'short', ranch: 'short', lindon: 'met' },
    calendarLive: true,
  });
  assert.match(text, /^UML shadow 2026-10-29/);
  assert.match(text, /River: paused/);
  assert.match(text, /Ranch: \d+ raises, \d+ promotions, [1-9]\d* booked left alone/);
  assert.match(text, /Lindon: \d+ raises, 0 promotions/);
  assert.match(text, /Nothing sent to Hospitable/);
});
