import assert from 'node:assert/strict';
import test from 'node:test';
import { ownerPortalView, OWNER_PORTAL_NOTES } from './owner-portal.ts';
import { buildOwnerStatement } from './owner-statement.ts';
import type { Expense, Reservation } from './api';

/*
 * `/owner/<token>` is rendered by `OwnerPortal`, not by `OwnerStatement`, and it carries its own
 * `OwnerPortalView` type. I fixed the basis sentence on the wrong component first, and the live page
 * kept showing "The fee was $11,469." with no basis — so this file tests **the portal view**, the one
 * Todd actually opens. Nine links exist and none had ever been viewed, so nothing else was checking it.
 */

const RES: Reservation[] = [
  {
    id: 't-op-1',
    guestName: 'Test Guest',
    propertyId: 'ranch',
    checkIn: '2026-06-01',
    checkOut: '2026-06-05',
    payout: 9200,
    source: 'Airbnb',
    status: 'confirmed',
  },
];

const EXP: Expense[] = [
  { id: 't-op-clean', month: '2026-06', propertyId: 'ranch', category: 'Cleaning', amount: 1200, note: 't' },
  { id: 't-op-mort', month: '2026-06', propertyId: 'ranch', category: 'Mortgage', amount: 3000, note: 't' },
  { id: 't-op-util', month: '2026-06', propertyId: 'ranch', category: 'Utilities', amount: 500, note: 't' },
];

function view() {
  const statement = buildOwnerStatement('2026-06', 'year', RES, EXP);
  return ownerPortalView(statement, 'ytd');
}

test('the portal carries the fee basis, not just the fee', () => {
  const data = view();
  assert.ok(data.fee > 0, 'this fixture would not exercise the fee');
  assert.ok(data.feeBasis > 0, 'the basis was not carried to the portal');
  // The whole point: the basis is rent after cleaning, so it is less than the host payout.
  const payout = data.houses.reduce((total, house) => total + house.revenue, 0);
  assert.ok(data.feeBasis < payout, 'the basis should be rent after cleaning, below the host payout');
  // And the fee is 20% of that basis.
  assert.ok(
    Math.abs(data.fee - data.feeBasis * 0.2) < 0.05,
    `fee ${data.fee} is not 20% of the published basis ${data.feeBasis}`,
  );
});

test('each house row carries the working, and it rebuilds the share', () => {
  const data = view();
  for (const house of data.houses) {
    assert.equal(typeof house.leftover, 'number', `${house.id} has no leftover to show`);
    assert.equal(typeof house.cleaning, 'number', `${house.id} has no cleaning figure`);

    // The row must reconcile from what it prints.
    const rebuilt = house.revenue - house.cleaning - house.fee - (house.costs - house.cleaning);
    assert.ok(
      Math.abs(rebuilt - house.leftover) < 0.05,
      `${house.id}: printed figures rebuild ${rebuilt.toFixed(2)} but the row says ${house.leftover.toFixed(2)}`,
    );
    assert.ok(Math.abs(house.leftover / 2 - house.todd) < 0.05, `${house.id}: half the leftover is not the share`);
  }
});

test('the notes say what the 20% is charged on', () => {
  const note = OWNER_PORTAL_NOTES.join(' ');
  assert.match(note, /after cleaning/i, 'the notes never say what the fee is taken from');
  assert.match(note, /not on the whole guest payout/i);
});

test('the portal still shows no guest names and no construction money', () => {
  const data = view();
  // The notes mention construction only to say it is excluded; the figures must not carry it.
  const figures = JSON.stringify({ houses: data.houses, months: data.months, todd: data.todd, fee: data.fee });
  assert.equal(/Test Guest/.test(figures), false, 'a guest name reached the owner portal figures');
  assert.equal(/construction/i.test(figures), false, 'construction money reached the owner portal figures');

  // Only Ranch and River are ever returned.
  for (const house of data.houses) {
    assert.ok(house.id === 'ranch' || house.id === 'river', `${house.id} is not an owner house`);
  }
});

test('a stay with no cleaning receipt is flagged as an estimate, not passed off as a booked cost', () => {
  // The real shape of February 2026: one Ranch stay, no cleaning expense, so the fallback assumes
  // stays x $350. That estimate is charged into the fee basis, so the owner has to be told.
  const noReceipt = EXP.filter((expense) => expense.category !== 'Cleaning');
  const statement = buildOwnerStatement('2026-06', 'year', RES, noReceipt);
  const data = ownerPortalView(statement, 'ytd');
  const ranch = data.houses.find((house) => house.id === 'ranch')!;

  assert.ok(ranch.estimatedCleaning > 0, 'the assumed cleaning was not recorded');
  assert.equal(ranch.estimatedCleaning, 350, 'one stay at the Ranch should assume the $350 house fee');
  // The estimate is part of the cleaning it stands in for, not an extra deduction on top.
  assert.equal(ranch.cleaning, ranch.estimatedCleaning);

  // With a real receipt, nothing is estimated.
  const withReceipt = ownerPortalView(buildOwnerStatement('2026-06', 'year', RES, EXP), 'ytd');
  for (const house of withReceipt.houses) {
    assert.equal(house.estimatedCleaning, 0, `${house.id} flagged an estimate even though receipts exist`);
  }
});
