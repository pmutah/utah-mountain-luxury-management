import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { buildHouseComparisonRows, TRIP_ARCHETYPES } from './house-compare.ts';
import { SLEEPS, SLEEPS_TOGETHER } from './house-stay.ts';

test('the house comparison matrix derives capacities from SLEEPS and carries no prices or codes', () => {
  const rows = buildHouseComparisonRows();
  assert.ok(rows.length >= 7);
  const text = JSON.stringify(rows);
  assert.equal(text.includes('$'), false, 'comparison matrix must not invent static prices');
  assert.equal(/door\s*code|wi-?fi\s*password/i.test(text), false);

  const cap = rows.find((r) => r.label === 'Overnight capacity')!;
  assert.match(cap.values.river, new RegExp(`Up to ${SLEEPS.river}`));
  assert.match(cap.values.ranch, new RegExp(`Up to ${SLEEPS.ranch}`));
  assert.match(cap.values.lindon, new RegExp(`Up to ${SLEEPS.lindon}`));

  const compound = TRIP_ARCHETYPES.find((a) => a.id === 'compound')!;
  assert.match(compound.summary, new RegExp(String(SLEEPS_TOGETHER)));
});

test('HouseGallery offers the ambient cinema tour and DirectReserveCard wires splitPay to splitTotal', () => {
  const gallery = readFileSync(join(process.cwd(), 'src', 'components', 'HouseGallery.tsx'), 'utf8');
  assert.match(gallery, /data-bot="house-reel-open"/);
  assert.match(gallery, /uml-ken-burns/);

  const card = readFileSync(join(process.cwd(), 'src', 'components', 'DirectReserveCard.tsx'), 'utf8');
  assert.match(card, /data-bot="stay-split-calc"/);
  assert.match(card, /splitPay\(splitTotal, names\)/, 'group split calculator must split splitTotal so River parts stay accurate');
});
