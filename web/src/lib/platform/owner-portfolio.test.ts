/**
 * An owner never receives a house they are not part of.
 *
 * The defect this file exists for: `/api/expenses` and `/api/reservations` stripped Lindon, so the owner role looked enforced. But the
 * Overview tab calls `/api/portfolio/metrics` and `/api/portfolio/history`, and neither route consulted the role at all. One request
 * from the same owner session returned Lindon's revenue, profit, occupancy, and every Lindon booking with the guest's name on it. The
 * role was real on two routes and absent on the two the dashboard actually opens.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripPortfolioHouses, stripHouses } from '../../../functions/_lib/roles.ts';
import { portfolioProfit, portfolioRevenue, visibleHouses } from '../luxury.ts';
import type { PortfolioData } from '../api.ts';

const root = join(process.cwd());

/** A metrics payload shaped like the route's, with a booking at each house. */
function payload() {
  return {
    month: '2026-11',
    ranch: { revenue: 1000, profit: 600, occupancy: 40, stayCount: 1 },
    lindon: { revenue: 2000, profit: 1200, occupancy: 80, stayCount: 2 },
    river: { revenue: 3000, profit: 1800, occupancy: 60, stayCount: 3 },
    totalRevenue: 6000,
    totalProfit: 3600,
    avgOccupancy: 60,
    reservations: [
      { id: 'r1', propertyId: 'ranch', checkIn: '2026-11-03', guestName: 'Ranch Guest' },
      { id: 'l1', propertyId: 'lindon', checkIn: '2026-11-05', guestName: 'Lindon Guest' },
      { id: 'v1', propertyId: 'river', checkIn: '2026-11-07', guestName: 'River Guest' },
      { id: 'h1', checkIn: '2026-11-08', guestName: 'Household row' },
    ],
    expenses: [
      { id: 'e1', propertyId: 'ranch', amount: 100 },
      { id: 'e2', propertyId: 'lindon', amount: 200 },
      { id: 'e3', propertyId: 'river', amount: 300 },
    ],
    properties: [
      { id: 'ranch', address: 'Lindon' },
      { id: 'lindon', address: 'Harcliff' },
      { id: 'river', address: 'Provo Canyon' },
    ],
  };
}

test('an owner gets no Lindon figure, no Lindon guest, and a total that leaves it out', () => {
  const stripped = stripPortfolioHouses(payload(), 'owner');
  assert.equal(stripped.lindon, null, 'Lindon metrics reached an owner');
  assert.notEqual(stripped.ranch, null);
  assert.notEqual(stripped.river, null);

  // The totals are rebuilt, not passed through: 1000 + 3000, and 600 + 1800.
  assert.equal(stripped.totalRevenue, 4000, 'the total still includes Lindon');
  assert.equal(stripped.totalProfit, 2400, 'the total still includes Lindon profit');
  // The average is over the two houses the owner can see: (40 + 60) / 2.
  assert.equal(stripped.avgOccupancy, 50, 'the average still includes Lindon occupancy');

  // No guest from Lindon, and the household row with no house survives because it is not a house.
  const names = (stripped.reservations as Array<{ guestName: string }>).map((row) => row.guestName);
  assert.equal(names.includes('Lindon Guest'), false, "a Lindon guest's name reached an owner");
  assert.deepEqual(names, ['Ranch Guest', 'River Guest', 'Household row']);

  // The expense rows and the address book are filtered too.
  assert.equal(
    (stripped.expenses as Array<{ propertyId?: string }>).some((row) => row.propertyId === 'lindon'),
    false,
    'a Lindon expense reached an owner',
  );
  assert.equal(
    (stripped.properties as Array<{ id?: string }>).some((row) => row.id === 'lindon'),
    false,
    "Lindon's address reached an owner",
  );

  // The payload says what it omitted, so a card can be left out rather than drawn empty.
  assert.deepEqual(stripped.houseOmitted, ['lindon']);
  assert.deepEqual(stripped.houses, ['ranch', 'river']);
});

test('an admin payload is untouched', () => {
  /*
   * The whole existing behaviour has to survive. An admin sees three houses, the original total, the original average, and every
   * booking — the filter is a role rule, not a change to what the dashboard computes.
   */
  const source = payload();
  const stripped = stripPortfolioHouses(source, 'admin');
  assert.deepEqual(stripped.lindon, source.lindon);
  assert.equal(stripped.totalRevenue, 6000);
  assert.equal(stripped.totalProfit, 3600);
  assert.equal(stripped.avgOccupancy, 60);
  assert.equal((stripped.reservations as unknown[]).length, 4);
  assert.equal((stripped.properties as unknown[]).length, 3);
  // No houses/houseOmitted keys are added, so an admin response is byte-shape-identical to before.
  assert.equal('houseOmitted' in stripped, false);
});

test('the previous-month block and history rows get the same treatment', () => {
  // A nested block is where a filter is usually forgotten: the headline is stripped and the comparison still leaks.
  const withPrevious = {
    ...payload(),
    previous: {
      ranch: { revenue: 900, profit: 500, occupancy: 30 },
      lindon: { revenue: 1900, profit: 1100, occupancy: 70 },
      river: { revenue: 2900, profit: 1700, occupancy: 50 },
      totalRevenue: 5700,
      totalProfit: 3300,
      avgOccupancy: 50,
    },
  };
  const stripped = stripPortfolioHouses(withPrevious, 'owner');
  const previous = stripped.previous as Record<string, unknown>;
  assert.equal(previous.lindon, null, 'the previous month still carries Lindon');
  assert.equal(previous.totalRevenue, 3800, 'the previous total still includes Lindon');

  // A history array is one object per month, each with three house blocks.
  const withHistory = {
    ...payload(),
    history: [
      { month: '2026-10', ranch: { revenue: 1 }, lindon: { revenue: 2 }, river: { revenue: 3 }, totalRevenue: 6 },
      { month: '2026-09', ranch: { revenue: 4 }, lindon: { revenue: 5 }, river: { revenue: 6 }, totalRevenue: 15 },
    ],
  };
  const history = stripPortfolioHouses(withHistory, 'owner').history as Array<Record<string, unknown>>;
  for (const row of history) {
    assert.equal(row.lindon, null, 'a history month still carries Lindon');
    assert.equal(row.totalRevenue, (row.ranch as { revenue: number }).revenue + (row.river as { revenue: number }).revenue);
  }
});

test('the client reads a missing house as absent, never as zero', () => {
  /*
   * `null` and `0` are different statements. A zeroed house would render as "earned nothing this month", which is false and would make
   * an owner think Lindon had a bad month. The helpers answer "is this house here", and the export, the letter, the postcards and the
   * waterfall all go through them.
   */
  const data = {
    month: '2026-11',
    ranch: { revenue: 1000, profit: 600, occupancy: 40, stayCount: 1 },
    lindon: null,
    river: { revenue: 3000, profit: 1800, occupancy: 60, stayCount: 3 },
    totalRevenue: 4000,
    totalProfit: 2400,
    avgOccupancy: 50,
    reservations: [],
    expenses: [],
    extraCleaningFees: {},
    houses: ['ranch', 'river'],
    houseOmitted: ['lindon'],
  } as unknown as PortfolioData;

  assert.deepEqual(visibleHouses(data), ['ranch', 'river'], 'an omitted house is drawn anyway');
  assert.equal(portfolioRevenue(data), 4000);
  assert.equal(portfolioProfit(data), 2400);

  // Every surface that writes a house out reads the list rather than the literal three.
  for (const file of ['src/lib/export.ts', 'src/lib/owner-letter.ts', 'src/components/PropertyPostcards.tsx', 'src/components/PortfolioOverview.tsx']) {
    const source = readFileSync(join(root, file), 'utf8');
    assert.match(source, /visibleHouses\(/, `${file} still writes a fixed list of three houses`);
    assert.doesNotMatch(
      source,
      /data\.lindon\.(revenue|profit|occupancy|stayCount)/,
      `${file} dereferences data.lindon, which is null for an owner`,
    );
  }
  // The property page refuses rather than crashing when the house is not there.
  const detail = readFileSync(join(root, 'src/components/PropertyDetail.tsx'), 'utf8');
  assert.match(detail, /property-not-visible/, 'a house an owner may not see renders nothing instead of saying so');
});

test('stripHouses still leaves a row with no house alone', () => {
  // The household ledger is not a house; dropping it would change a total the owner is reading.
  const rows = [{ propertyId: 'ranch' }, { propertyId: 'lindon' }, { amount: 5 }];
  assert.equal(stripHouses(rows, 'owner').length, 2);
});
