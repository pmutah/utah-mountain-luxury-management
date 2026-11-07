import assert from 'node:assert/strict';
import test from 'node:test';
import { isOwnerToken, ownerPortalEmpty, ownerPortalPath, ownerPortalView } from './owner-portal.ts';
import type { OwnerStatement } from './owner-statement.ts';

const statement: OwnerStatement = {
  rangeLabel: 'January – November 2026',
  todd: 12345.678,
  fee: 4321.111,
  houses: [
    { id: 'ranch', name: 'The Ranch House', revenue: 40000, costs: 9000, todd: 12000.5, stays: 12 },
    { id: 'river', name: 'The River House', revenue: 20000, costs: 5000, todd: 4000.25, stays: 6 },
  ],
  months: [
    { month: '2026-10', label: 'October 2026', todd: 1000, ranch: 800, river: 200 },
    { month: '2026-11', label: 'November 2026', todd: 2000, ranch: 1500, river: 500 },
  ],
};

test('a minted link is 32 hex characters and the path carries it', () => {
  assert.equal(isOwnerToken('a'.repeat(32)), true);
  assert.equal(isOwnerToken('abcdef0123456789abcdef0123456789'), true);
  assert.equal(isOwnerToken('a'.repeat(31)), false);
  assert.equal(isOwnerToken('A'.repeat(32)), false);
  assert.equal(isOwnerToken(''), false);
  assert.equal(isOwnerToken('owner-link-preview'), false);
  assert.equal(ownerPortalPath('abc123'), '/owner/abc123');
});

test('the portal view names Ranch and River in cents and leaves Lindon out', () => {
  const view = ownerPortalView(statement, 'ytd');
  assert.equal(view.houses.length, 2);
  assert.deepEqual(
    view.houses.map((house) => house.id),
    ['ranch', 'river'],
  );
  assert.equal(view.todd, 12345.68);
  assert.equal(view.fee, 4321.11);
  assert.equal(view.houses[0]!.todd, 12000.5);
  assert.equal(view.months.length, 2);
  const text = JSON.stringify(view);
  assert.equal(text.includes('lindon'), false);
  assert.equal(text.includes('Guest'), false);
});

test('a month period keeps only the last month', () => {
  const month = ownerPortalView(statement, 'month');
  assert.equal(month.months.length, 1);
  assert.equal(month.months[0]!.month, '2026-11');
  assert.equal(month.rangeLabel, statement.rangeLabel);
});

test('the notes name the split and never a price', () => {
  const view = ownerPortalView(statement, 'ytd');
  const notes = view.notes.join(' ');
  assert.match(notes, /20% management fee/);
  assert.match(notes, /Lindon, household purchases, and construction bills are not on this page/);
  assert.equal(notes.includes('$'), false);
});

test('a statement with no months is called empty', () => {
  assert.equal(ownerPortalEmpty(ownerPortalView(statement, 'ytd')), false);
  assert.equal(ownerPortalEmpty(ownerPortalView({ ...statement, months: [] }, 'ytd')), true);
  assert.equal(ownerPortalEmpty(ownerPortalView({ ...statement, houses: [] }, 'ytd')), true);
});
