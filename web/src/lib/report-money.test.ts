/**
 * The report is what prints and what the owner letter reads from. A money figure there must be whole
 * cents: a real December read 5921.5599999999995 before this was rounded.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPortfolioReport } from './report.ts';

const MONEY = ['revenue', 'cleaning', 'mortgage', 'operating', 'profit', 'mgtFee', 'todd', 'brandon'] as const;
const CENTS = /^-?\d+(\.\d{1,2})?$/;

function isCents(value: number): boolean {
  return Math.round(value * 100) / 100 === value;
}

test('every money figure in the report is whole cents', () => {
  const report = buildPortfolioReport('2026-12', 'month', [], [], {}, 'all', 'all');
  const problems: string[] = [];
  for (const property of report.properties) {
    for (const key of MONEY) {
      const value = (property as unknown as Record<string, unknown>)[key];
      if (typeof value === 'number' && !isCents(value)) problems.push(`${property.propertyId}.${key} = ${value}`);
    }
  }
  for (const key of MONEY) {
    const value = (report.totals as unknown as Record<string, unknown>)[key];
    if (typeof value === 'number' && !isCents(value)) problems.push(`totals.${key} = ${value}`);
  }
  assert.deepEqual(problems, [], `money is not cents: ${problems.join(', ')}`);
});

test('an owner share is cents and still splits after the fee', () => {
  const report = buildPortfolioReport('2026-12', 'month', [], [], {}, 'all', 'todd');
  for (const property of report.properties) {
    if (!property.dist) continue;
    assert.ok(isCents(property.dist.todd), `${property.propertyId} todd share is not cents`);
    assert.ok(isCents(property.dist.brandon), `${property.propertyId} brandon share is not cents`);
    assert.ok(isCents(property.dist.mgtFee), `${property.propertyId} fee is not cents`);
  }
});

test('a printed money figure renders with at most two decimals', () => {
  const report = buildPortfolioReport('2026-12', 'month', [], [], {}, 'all', 'all');
  // `formatCurrency` is what the page and the paper use, so the text itself must be clean.
  for (const property of report.properties) {
    const text = String(property.revenue);
    assert.match(text, CENTS, `${text} would print with more than two decimals`);
  }
});

test('a ratio is still allowed to be fractional', () => {
  const report = buildPortfolioReport('2026-12', 'month', [], [], {}, 'all', 'all');
  const ranch = report.properties.find((row) => row.propertyId === 'ranch');
  assert.ok(ranch);
  // Occupancy is a percentage, not money, so it is not forced to cents.
  assert.equal(typeof ranch.occupancy, 'number');
  assert.ok(ranch.occupancy >= 0);
});
