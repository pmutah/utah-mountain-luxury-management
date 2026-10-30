import assert from 'node:assert/strict';
import test from 'node:test';
import type { Expense, Reservation } from './api.ts';
import { buildOwnerStatement, footOwnerHouses, footOwnerMonths } from './owner-statement.ts';

function stay(partial: Partial<Reservation> & Pick<Reservation, 'id' | 'propertyId' | 'checkIn' | 'checkOut' | 'payout'>): Reservation {
  return { guestName: 'Guest', source: 'Airbnb', ...partial };
}

test('Todd’s statement is Ranch and River only', () => {
  const expenses: Expense[] = [
    {
      id: 'h1',
      propertyId: 'household',
      month: '2026-10',
      category: 'Furnishings',
      amount: 900,
      note: 'sofa',
      createdAt: '2026-10-02',
    },
  ];
  const statement = buildOwnerStatement(
    '2026-10',
    'month',
    [
      stay({ id: 'r', propertyId: 'ranch', checkIn: '2026-10-02', checkOut: '2026-10-05', payout: 1000 }),
      stay({ id: 'l', propertyId: 'lindon', checkIn: '2026-10-02', checkOut: '2026-10-04', payout: 800 }),
    ],
    expenses,
  );
  assert.deepEqual(
    statement.houses.map((house) => house.id),
    ['ranch', 'river'],
  );
  assert.equal(statement.houses[0]?.revenue, 1000);
  assert.equal(statement.houses[1]?.revenue, 0);
  assert.ok(Math.abs(statement.todd - -1306.68) < 0.02);
  assert.equal(statement.months.length, 1);
  assert.ok(Math.abs((statement.months[0]?.todd ?? 0) - statement.todd) < 0.02);

  const ytd = buildOwnerStatement('2026-10', 'ytd', [
    stay({ id: 'r', propertyId: 'ranch', checkIn: '2026-10-02', checkOut: '2026-10-05', payout: 1000 }),
    stay({ id: 'l', propertyId: 'lindon', checkIn: '2026-10-02', checkOut: '2026-10-04', payout: 800 }),
  ], expenses);
  assert.equal(ytd.months[0]?.month, '2026-01');
  assert.equal(ytd.months.at(-1)?.month, '2026-10');
  const sum = ytd.months.reduce((total, row) => total + row.todd, 0);
  assert.equal(Math.round(sum * 100), Math.round(ytd.todd * 100));
  assert.equal(
    ytd.months.every((row) => Math.round((row.ranch + row.river) * 100) === Math.round(row.todd * 100)),
    true,
  );
  const ranchHouse = ytd.houses.find((house) => house.id === 'ranch')?.todd ?? 0;
  const riverHouse = ytd.houses.find((house) => house.id === 'river')?.todd ?? 0;
  assert.equal(
    Math.round(ytd.months.reduce((total, row) => total + row.ranch, 0) * 100),
    Math.round(ranchHouse * 100),
  );
  assert.equal(
    Math.round(ytd.months.reduce((total, row) => total + row.river, 0) * 100),
    Math.round(riverHouse * 100),
  );
  assert.equal(ytd.houses.some((house) => house.id === 'lindon'), false);
});

test('a leftover penny stays on the last month', () => {
  const rows = footOwnerMonths(0.03, [
    { month: '2026-01', label: 'January 2026', todd: 0.014, ranch: 0.014, river: 0 },
    { month: '2026-02', label: 'February 2026', todd: 0.014, ranch: 0.014, river: 0 },
  ]);
  assert.equal(rows[0]?.todd, 0.01);
  assert.equal(rows[1]?.todd, 0.02);
  assert.equal(Math.round(rows.reduce((total, row) => total + row.todd, 0) * 100), 3);
  assert.equal(rows.every((row) => Math.round((row.ranch + row.river) * 100) === Math.round(row.todd * 100)), true);
});

test('Ranch and River each month add up to that month', () => {
  const statement = buildOwnerStatement(
    '2026-10',
    'month',
    [
      stay({ id: 'r', propertyId: 'ranch', checkIn: '2026-10-02', checkOut: '2026-10-05', payout: 1000 }),
      stay({ id: 'v', propertyId: 'river', checkIn: '2026-10-10', checkOut: '2026-10-12', payout: 2000 }),
    ],
    [],
  );
  const row = statement.months[0];
  assert.ok(row);
  assert.ok(row.ranch !== 0);
  assert.ok(row.river !== 0);
  assert.equal(Math.round((row.ranch + row.river) * 100), Math.round(row.todd * 100));
  assert.deepEqual(footOwnerHouses(0.03, 0.014, 0.014), { ranch: 0.01, river: 0.02 });
});
