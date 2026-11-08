/*
 * Render the owner statement to text from the real builder + the real component copy, so the wording that
 * ships can be read without a browser. This is a probe, not part of the suite.
 */
import { buildOwnerStatement } from './src/lib/owner-statement.ts';
import { formatCurrency } from './src/lib/format';

const RES = [
  {
    id: 't1',
    guestName: 'G',
    propertyId: 'ranch',
    checkIn: '2026-06-01',
    checkOut: '2026-06-05',
    payout: 9200,
    source: 'Airbnb',
    status: 'confirmed',
  },
];

const EXP = [
  { id: 'm', propertyId: 'ranch', date: '2026-06-01', amount: 3000, category: 'Mortgage', note: 't' },
];

const s = buildOwnerStatement('2026-06', 'year', RES as never, EXP as never);
const ranch = s.houses.find((h) => h.id === 'ranch')!;

console.log('--- what the page prints ---');
console.log('headline share :', formatCurrency(s.todd));
console.log('fee line       : management fee', formatCurrency(s.fee));
console.log('house line     :', `${formatCurrency(ranch.revenue)} host payout · ${formatCurrency(ranch.costs)} costs · ${ranch.stays} stays`);
console.log(
  'working        :',
  `${formatCurrency(ranch.leftover)} left after the ${formatCurrency(ranch.fee)} fee and costs. Half is ${formatCurrency(ranch.todd)}.`,
);

// The reader's own check, using only printed numbers.
const reconstruct = (ranch.revenue - ranch.fee - ranch.costs) / 2;
console.log('--- can an owner check it? ---');
console.log('revenue - fee - costs, halved =', formatCurrency(reconstruct));
console.log('printed share                 =', formatCurrency(ranch.todd));
console.log('reconciles                    =', Math.abs(reconstruct - ranch.todd) < 0.05);
