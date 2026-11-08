import { quoteStay } from '../src/lib/quote.ts';
import { denverToday } from '../src/lib/market/dates.ts';

const today = denverToday();
console.log('asOf', today);

const cases: Array<[string, Record<string, unknown>]> = [
  ['no guests', { asOf: today, closed: [], pace: 'unknown' }],
  ['guests 3', { asOf: today, closed: [], pace: 'unknown', guests: 3 }],
  ['guests 3 children 0', { asOf: today, closed: [], pace: 'unknown', guests: 3, children: 0 }],
];

for (const [label, opts] of cases) {
  try {
    const q = quoteStay('ranch', '2027-04-12', '2027-04-14', [], opts as never);
    console.log(label.padEnd(22), 'ok:', q.ok, q.ok ? q.stayTotal : q.reason);
  } catch (e) {
    console.log(label.padEnd(22), 'THREW:', (e as Error).message);
    console.log((e as Error).stack?.split('\n').slice(1, 5).join('\n'));
  }
}
