import type { OwnerStatement } from './owner-statement';
import { MANAGEMENT_FEE_LABEL } from './owner-fee';

function money(value: number): string {
  return (Math.round((value + Number.EPSILON) * 100) / 100).toFixed(2);
}

function cell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** Todd's statement as a spreadsheet. The books are not changed. */
export function ownerStatementCsv(statement: OwnerStatement): string {
  const ranch = statement.months.reduce((sum, row) => sum + row.ranch, 0);
  const river = statement.months.reduce((sum, row) => sum + row.river, 0);
  const lines = [
    'Owner,Todd Wilhite',
    `Period,${cell(statement.rangeLabel)}`,
    'Houses,Ranch and River',
    `Note,"After the ${MANAGEMENT_FEE_LABEL} management fee, then half. Lindon, household purchases, and construction are not in this file. This file does not change the books."`,
    '',
    'Month,Ranch,River,Total',
    ...statement.months.map((row) => [cell(row.label), money(row.ranch), money(row.river), money(row.todd)].join(',')),
    `Total,${money(ranch)},${money(river)},${money(statement.todd)}`,
    '',
    'House,Host payout,Costs,Stays,Todd share',
    ...statement.houses.map((house) =>
      [cell(house.name), money(house.revenue), money(house.costs), String(house.stays), money(house.todd)].join(','),
    ),
    `Management fee,,,,${money(statement.fee)}`,
  ];
  return `${lines.join('\n')}\n`;
}

export function ownerStatementFilename(rangeLabel: string): string {
  const slug = rangeLabel
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `todd-ranch-river-${slug || 'statement'}.csv`;
}
