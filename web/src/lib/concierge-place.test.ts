import assert from 'node:assert/strict';
import test from 'node:test';
import { conciergeIntro, conciergePlaceBrief } from './concierge-place.ts';

const RIVER_ADDRESS = 'Vivian Park, Provo Canyon, Utah 84604';
const RIVER_ARRIVAL = 'Drive up Provo Canyon to Vivian Park. Stock up on groceries in Orem first. AWD or 4WD in winter.';
const RANCH_ADDRESS = '270 East Center Street, Lindon, Utah 84042';
const RANCH_ARRIVAL = 'The house is in Lindon, about 45 minutes south of the Salt Lake airport.';
const LINDON_ADDRESS = '143 Harcliff Circle, Lindon, Utah 84042';
const LINDON_ARRIVAL = 'The house is in Lindon, about 15 minutes from BYU and 45 minutes from the Salt Lake airport.';

test('Nora places each house from the published address', () => {
  const river = conciergePlaceBrief(RIVER_ADDRESS, RIVER_ARRIVAL);
  assert.match(river.where, /Vivian Park, Provo Canyon, Utah 84604/);
  assert.match(river.where, /Drive up Provo Canyon to Vivian Park/);
  assert.match(river.where, /up the canyon from this house/);
  assert.match(river.drive, /up the canyon/);
  assert.equal(river.where.includes('Lindon'), false);
  assert.equal(river.where.includes('$'), false);
  assert.equal(/about \d+ minutes/.test(river.where), false);

  const ranch = conciergePlaceBrief(RANCH_ADDRESS, RANCH_ARRIVAL);
  assert.match(ranch.where, /270 East Center Street, Lindon, Utah 84042/);
  assert.match(ranch.where, /45 minutes south of the Salt Lake airport/);
  assert.match(ranch.drive, /this house in Lindon/);
  assert.match(ranch.drive, /Provo Canyon is a drive from here/);
  assert.equal(ranch.where.includes('This house is in Provo Canyon'), false);
  assert.equal(ranch.where.includes('up the canyon from this house'), false);
  assert.equal(ranch.where.includes('$'), false);

  const lindon = conciergePlaceBrief(LINDON_ADDRESS, LINDON_ARRIVAL);
  assert.match(lindon.where, /143 Harcliff Circle, Lindon, Utah 84042/);
  assert.match(lindon.where, /15 minutes from BYU/);
  assert.match(lindon.drive, /this house in Lindon/);
  assert.equal(lindon.where.includes('This house is in Provo Canyon'), false);

  const missing = conciergePlaceBrief('', RANCH_ARRIVAL);
  assert.match(missing.where, /published address/);
  assert.equal(missing.where.includes('Provo Canyon'), false);

  assert.match(conciergeIntro(RIVER_ADDRESS, RIVER_ARRIVAL), /the canyon/);
  assert.equal(conciergeIntro(RIVER_ADDRESS, RIVER_ARRIVAL).includes('Lindon'), false);
  assert.match(conciergeIntro(RANCH_ADDRESS, RANCH_ARRIVAL), /Lindon/);
  assert.equal(conciergeIntro(RANCH_ADDRESS, RANCH_ARRIVAL).includes('the canyon'), false);
  assert.match(conciergeIntro(LINDON_ADDRESS, LINDON_ARRIVAL), /Lindon/);
  assert.equal(conciergeIntro(LINDON_ADDRESS, LINDON_ARRIVAL).includes('the canyon'), false);
  assert.equal(conciergeIntro(RANCH_ADDRESS, RANCH_ARRIVAL).includes('$'), false);
});
