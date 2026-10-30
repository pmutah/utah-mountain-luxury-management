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
  const blocked = runShadow(board, ['2026-11-06'], false, '2026-11-06', 'short', ['2026-11-06']);
  assert.equal(blocked.nights[0]?.action, 'closed');
  assert.match(blocked.nights[0]?.reason ?? '', /Closed on the calendar/);
  assert.equal(blocked.counts.booked, 0);
  assert.equal(blocked.nights[0]?.promotionPercent, 0);
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
  assert.match(text, /Booking page: River Nov 1 can quote 2, 3, 4, 7, 14, 28 nights/);
  assert.match(text, /Add-ons: .*River Nov 1 can request an early arrival/);
  const calendarLine = text.split('\n').find((line) => line.startsWith('Booking calendar:'));
  assert.match(calendarLine ?? '', /weekend nights show 2 nights/);
  assert.match(calendarLine ?? '', /Nov 23 starts at 4 nights/);
  assert.equal((calendarLine ?? '').includes('$'), false);
  const otherHouses = text.split('\n').find((line) => line.startsWith('Other houses:'));
  assert.match(otherHouses ?? '', /River: Ranch and Lindon will quote the same dates/);
  assert.equal((otherHouses ?? '').includes('$'), false);
  const quiet = portfolioDigest({
    asOf: '2026-10-29',
    taken: { river: [], ranch: [], lindon: [] },
    paused: { river: false, ranch: false, lindon: false },
    pace: { river: 'unknown', ranch: 'unknown', lindon: 'unknown' },
    calendarLive: false,
  });
  assert.equal(quiet.includes('Booking page:'), false);
  assert.equal(quiet.includes('Booking calendar:'), false);
  assert.equal(quiet.includes('Other houses:'), false);
  assert.equal(quiet.includes('Parties:'), false);
  assert.equal(quiet.includes('Children:'), false);
  assert.equal(text.includes('Children:'), false);
  assert.equal(text.includes('Arrivals:'), false);
  assert.equal(text.includes('Departures:'), false);
  assert.match(quiet, /Nothing sent to Hospitable/);
});

test('the daily text names party size, arrival, and departure without a name or a price', () => {
  const text = portfolioDigest({
    asOf: '2026-10-29',
    taken: { river: [], ranch: [], lindon: [] },
    paused: { river: false, ranch: false, lindon: false },
    pace: { river: 'unknown', ranch: 'unknown', lindon: 'unknown' },
    calendarLive: false,
    stays: [
      { id: 'ranch-1', propertyId: 'ranch', checkIn: '2026-11-04', checkOut: '2026-11-06', status: 'confirmed', partySize: 4, childCount: 1 },
      { id: 'river-1', propertyId: 'river', checkIn: '2026-11-10', checkOut: '2026-11-13', status: 'confirmed', partySize: null },
    ],
    arrivalWindows: { 'ranch-1': '6:00 PM', 'river-1': '801-555-0100' },
    departureWindows: { 'ranch-1': '11:00 AM', 'river-1': 'Ada Lovelace' },
  });
  const parties = text.split('\n').find((line) => line.startsWith('Parties:')) ?? '';
  const arrivals = text.split('\n').find((line) => line.startsWith('Arrivals:')) ?? '';
  const departures = text.split('\n').find((line) => line.startsWith('Departures:')) ?? '';
  const children = text.split('\n').find((line) => line.startsWith('Children:')) ?? '';
  assert.match(parties, /1 stay names a party size/);
  assert.match(children, /Ranch Nov 4, 1 child/);
  assert.equal(children.includes('$'), false);
  assert.match(parties, /River Nov 10/);
  assert.match(arrivals, /Ranch Nov 4, Arrival around 6:00 PM/);
  assert.match(departures, /Ranch Nov 6, Leave at 11:00 AM/);
  assert.match(departures, /River Nov 13/);
  assert.equal(parties.includes('$'), false);
  assert.equal(arrivals.includes('801'), false);
  assert.equal(departures.includes('Ada'), false);
  assert.equal(text.includes('Guest'), false);
  assert.match(text, /Nothing sent to Hospitable/);
});
