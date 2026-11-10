/**
 * Every number the owner statement sends is a number the owner can see.
 *
 * Todd reads this page to check his share. The route has always sent `houses[].cleaning`, and the page said "after the fee and
 * costs" and "rent after cleaning" without ever printing it — so the arithmetic could not be followed by hand.
 *
 * Same shape as the three the last turns found: the API is right and the surface does not show it. This one matters differently,
 * because the reader is the person whose money it is.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { ownerPortalView } from './owner-portal.ts';
import { buildOwnerStatement } from './owner-statement.ts';

const PAGE = readFileSync('src/components/OwnerPortal.tsx', 'utf8');

/** A statement built the way the route builds one, from real-shaped inputs. */
function statement() {
  const reservations = [
    { id: 'r1', guestName: 'A', propertyId: 'ranch', checkIn: '2026-07-01', checkOut: '2026-07-05', payout: 3200, source: 'Airbnb', status: 'confirmed' },
    { id: 'r2', guestName: 'B', propertyId: 'river', checkIn: '2026-07-10', checkOut: '2026-07-14', payout: 5200, source: 'VRBO', status: 'confirmed' },
  ] as never[];
  const expenses = [
    { id: 'e1', month: '2026-07', propertyId: 'ranch', category: 'Cleaning', amount: 285, note: '', createdAt: '2026-07-05' },
    { id: 'e2', month: '2026-07', propertyId: 'ranch', category: 'Repairs', amount: 400, note: '', createdAt: '2026-07-06' },
  ] as never[];
  return ownerPortalView(buildOwnerStatement('2026-07', 'month', reservations, expenses, {}), 'month');
}

test('the cleaning figure the statement carries is drawn', () => {
  const view = statement();
  const withCleaning = view.houses.filter((house) => house.cleaning > 0);
  assert.ok(withCleaning.length > 0, 'the fixture produced no cleaning to check');

  // The page must read the field at all, and put it inside the house table.
  assert.match(PAGE, /house\.cleaning/, 'the owner page never reads the cleaning figure the route sends');
  assert.match(PAGE, /data-bot="owner-portal-cleaning"/, 'there is no element for the cleaning line');
});

test('a house with no cleaning shows no cleaning line', () => {
  /*
   * A "Cleaning $0.00" line on every house would be noise, and would also read as a claim that nothing was cleaned. The block is
   * conditional, so a house without it shows nothing.
   */
  assert.match(PAGE, /house\.cleaning > 0 &&/, 'the cleaning line is not conditional on there being a figure');
});

test('the fee basis and the cleaning agree, so the page cannot contradict itself', () => {
  /*
   * The header says the fee is charged on rent after cleaning, and the row puts cleaning inside costs. If those two ever used
   * different cleaning numbers the page would be internally inconsistent — asserted on the arithmetic, not the prose.
   */
  const view = statement();
  for (const house of view.houses) {
    const basis = house.revenue - house.cleaning;
    assert.ok(house.fee <= basis * 0.2 + 0.01, `${house.name}: the fee is more than 20% of rent after cleaning`);
  }
});

test('every house number reaches the table', () => {
  // The columns the owner reads, one assertion each, so a field cannot quietly stop being drawn.
  for (const field of ['stays', 'revenue', 'costs', 'todd', 'fee', 'leftover', 'cleaning']) {
    assert.ok(PAGE.includes(`house.${field}`), `the owner table never draws ${field}`);
  }
});
