import assert from 'node:assert/strict';
import test from 'node:test';
import { ownerTrial, ownerTrialHouses } from './owner-trial.ts';

test('a trial amount takes the fee first and splits what remains', () => {
  const gain = ownerTrial('1000');
  assert.equal(gain?.feeCents, 20000);
  assert.equal(gain?.toddCents, 40000);
  assert.equal(gain?.partnerCents, 40000);
  assert.match(gain?.line ?? '', /management fee is \$200\.00/);
  assert.match(gain?.line ?? '', /Todd’s half is \$400\.00/);
  assert.match(gain?.line ?? '', /does not read saved bookings/);
  assert.match(gain?.line ?? '', /Nothing was written over them/);

  const loss = ownerTrial('-100');
  assert.equal(loss?.feeCents, 0);
  assert.equal(loss?.toddCents, -5000);
  assert.equal(loss?.partnerCents, -5000);
  assert.match(loss?.line ?? '', /A loss after the fee/);

  assert.equal(ownerTrial('0')?.line.includes('no fee and no half'), true);
  assert.equal(ownerTrial(''), null);
  assert.equal(ownerTrial('12.50'), null);
  const text = `${gain?.line} ${loss?.line}`;
  assert.equal(/statement|lindon|household|construction/i.test(text), false);
  const both = ownerTrialHouses('1000', '1000');
  const added = ownerTrial('2000');
  assert.equal(both?.feeCents, added?.feeCents);
  assert.equal(both?.toddCents, added?.toddCents);
  assert.match(both?.line ?? '', /Ranch and River are added before the fee/);
  const offset = ownerTrialHouses('100', '-100');
  assert.equal(offset?.feeCents, 0);
  assert.match(offset?.line ?? '', /no fee and no half/);
  assert.equal(ownerTrialHouses('', ''), null);
  assert.equal(ownerTrialHouses('12.50', '10'), null);
  assert.equal(ownerTrialHouses('1000', '')?.feeCents, ownerTrial('1000')?.feeCents);
  const houses = `${both?.line} ${offset?.line}`;
  assert.equal(/statement|lindon|household|construction/i.test(houses), false);
});
