import assert from 'node:assert/strict';
import test from 'node:test';
import type { Expense, Reservation } from './api.ts';
import { buildOwnerStatement } from './owner-statement.ts';

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
});
