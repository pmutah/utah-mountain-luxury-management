import assert from 'node:assert/strict';
import test from 'node:test';
import type { Expense, Reservation } from './api.ts';
import { ownerStatementCsv, ownerStatementFilename } from './owner-statement-file.ts';
import { buildOwnerStatement } from './owner-statement.ts';

function stay(partial: Partial<Reservation> & Pick<Reservation, 'id' | 'propertyId' | 'checkIn' | 'checkOut' | 'payout'>): Reservation {
  return { guestName: 'Guest', source: 'Airbnb', ...partial };
}

function parseRow(line: string): string[] {
  const out: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else quoted = false;
      } else current += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      out.push(current);
      current = '';
    } else current += char;
  }
  out.push(current);
  return out;
}

test('the statement file matches the month lines and leaves Lindon out', () => {
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
  const reservations: Reservation[] = [
    stay({ id: 'r', propertyId: 'ranch', checkIn: '2026-10-02', checkOut: '2026-10-05', payout: 1000 }),
    stay({ id: 'v', propertyId: 'river', checkIn: '2026-10-08', checkOut: '2026-10-10', payout: 2000 }),
    stay({ id: 'l', propertyId: 'lindon', checkIn: '2026-10-02', checkOut: '2026-10-04', payout: 800 }),
  ];
  const statement = buildOwnerStatement('2026-10', 'ytd', reservations, expenses);
  const csv = ownerStatementCsv(statement);
  assert.match(csv, /Lindon, household purchases, and construction are not in this file/);
  assert.equal(csv.includes('The Lindon'), false);
  assert.equal(csv.includes('sofa'), false);
  assert.equal(csv.includes('Guest'), false);
  assert.match(csv, /This file does not change the books/);

  const table = csv.trim().split('\n').map(parseRow);
  const header = table.findIndex((row) => row[0] === 'Month');
  const total = table.find((row) => row[0] === 'Total');
  assert.ok(total);
  const months = table.slice(header + 1, table.findIndex((row) => row[0] === 'Total'));
  assert.equal(months.length, statement.months.length);
  const ranchCents = months.reduce((sum, row) => sum + Math.round(Number(row[1]) * 100), 0);
  const riverCents = months.reduce((sum, row) => sum + Math.round(Number(row[2]) * 100), 0);
  const toddCents = months.reduce((sum, row) => sum + Math.round(Number(row[3]) * 100), 0);
  assert.equal(months.every((row) => Math.round(Number(row[1]) * 100) + Math.round(Number(row[2]) * 100) === Math.round(Number(row[3]) * 100)), true);
  assert.equal(Math.round(Number(total[1]) * 100), ranchCents);
  assert.equal(Math.round(Number(total[2]) * 100), riverCents);
  assert.equal(Math.round(Number(total[3]) * 100), toddCents);
  assert.equal(toddCents, Math.round(statement.todd * 100));
  assert.equal(ranchCents, Math.round((statement.houses.find((house) => house.id === 'ranch')?.todd ?? 0) * 100));
  assert.equal(riverCents, Math.round((statement.houses.find((house) => house.id === 'river')?.todd ?? 0) * 100));
  assert.equal(ownerStatementFilename(statement.rangeLabel), 'todd-ranch-river-january-2026-october-2026.csv');
});
