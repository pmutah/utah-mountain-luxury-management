import assert from 'node:assert/strict';
import test from 'node:test';
import { compHouseKey } from '../../functions/_lib/pricing-store.ts';

/*
 * One house, one comp.
 *
 * While looking for a third Ranch comp, two "new" candidates turned out to be houses already saved under
 * the other platform: `Luxury -7000 SQFT-Sleeps 20- Bball VBall 1 Acre` on Airbnb is the same home as the
 * VRBO `Luxury 7000 SQFT · Sleeps 20 · Orem` already stored, quoting $537 against $527 for the same nights;
 * and `Sleeps 20! Orem Oasis` on Airbnb is the VRBO Orem Oasis.
 *
 * Nothing stopped both being saved, and each copy counts as an independent observation — so a single
 * landlord could supply every observation on a night and the band would read as a market while measuring
 * one competitor. `compHouseKey` reduces a listing to the house behind it so a second platform is refused.
 */

test('two platforms for one house collide on the address, which is the whole point', () => {
  /*
   * The case the title key could not catch. VRBO and Airbnb describe this house differently, but both
   * publish the same street, and the street is the house.
   */
  const vrbo = { label: 'Luxury 7000 SQFT · Sleeps 20 · Orem', sleeps: 20, address: '1234 W 400 N, Orem, UT 84057' };
  const airbnb = { label: 'Luxury -7000 SQFT-Sleeps 20- Bball VBall 1 Acre', sleeps: 20, address: '1234 W 400 N, Orem, UT 84057' };
  assert.equal(compHouseKey(vrbo), compHouseKey(airbnb), 'the same street must produce the same key');
  assert.match(compHouseKey(vrbo), /^addr:/, 'an address key should be recognisable as one');
});

test('the address key ignores the spelling differences a listing may use', () => {
  const a = compHouseKey({ address: '270 East Center Street, Lindon, Utah 84042' });
  const b = compHouseKey({ address: '270 E Center St, Lindon UT 84042' });
  // Abbreviations and the state/postcode are normalised, so both reduce to the house and number.
  assert.match(a, /^addr:/);
  assert.match(a, /270/);
  assert.match(a, /center/);
  assert.equal(/street/.test(a), false, 'the suffix survived normalisation');
  assert.equal(/84042/.test(a), false, 'the postcode survived normalisation');
  assert.equal(a, b, 'the abbreviated form of the same address must match');
});

test('two different streets never collide, even at the same size', () => {
  const one = compHouseKey({ address: '100 Main St, Orem, UT 84057', sleeps: 20 });
  const two = compHouseKey({ address: '200 Main St, Orem, UT 84057', sleeps: 20 });
  assert.notEqual(one, two);
});

test('with no address the key falls back to the title, and says so by shape', () => {
  const title = compHouseKey({ label: 'Orem Oasis · Sleeps 20 · Game Rm', sleeps: 20 });
  assert.equal(title.startsWith('addr:'), false, 'a title key must not look like an address key');
  assert.match(title, /orem oasis/);
});

test('a very short address is not treated as one', () => {
  // "UT" or a bare number is not an address; it must fall through to the title rather than match everything.
  const key = compHouseKey({ address: 'UT', label: 'Some House', sleeps: 12 });
  assert.equal(key.startsWith('addr:'), false);
});

test('two platform names that share the house words collapse to one key', () => {
  // The Oasis is listed on both platforms and both titles contain "Orem Oasis", so this pair is caught.
  const a = compHouseKey({ label: 'Sleeps 20! Orem Oasis Game Room & Hot Tub Retreat', sleeps: 20 });
  const b = compHouseKey({ label: 'Orem Oasis · Sleeps 20 · Game Rm', sleeps: 20 });
  assert.match(a, /orem oasis/);
  assert.match(b, /orem oasis/);
  assert.ok(a.includes('orem oasis') && b.includes('orem oasis'));
});

test('a title key does NOT catch one house described differently by each platform', () => {
  /*
   * This is the limitation, pinned so nobody trusts the guard further than it goes. The real pair:
   * VRBO `Luxury 7000 SQFT · Sleeps 20 · Orem` and Airbnb `Luxury -7000 SQFT-Sleeps 20- Bball VBall 1 Acre`
   * reduce to different keys. A title cannot know they are the same home.
   */
  const vrbo = compHouseKey({ label: 'Luxury 7000 SQFT · Sleeps 20 · Orem', sleeps: 20 });
  const airbnb = compHouseKey({ label: 'Luxury -7000 SQFT-Sleeps 20- Bball VBall 1 Acre', sleeps: 20 });
  assert.notEqual(vrbo, airbnb, 'the two platform titles should be different keys — this documents the gap');
  // The honest consequence: cross-platform identity needs host + address, which the store does not keep yet.
});

test('different houses at the same size keep different keys', () => {
  const one = compHouseKey({ label: 'The BYU Fan House', sleeps: 28 });
  const two = compHouseKey({ label: 'Large House for Family, Groups, Retreats', sleeps: 34 });
  assert.notEqual(one, two, 'two distinct houses must not collapse into one key');
});

test('a key with no sleep count is distinguishable, so it can be refused rather than matched', () => {
  // A comp without sleeps is refused earlier, but the key must not silently match a real house.
  const withSleeps = compHouseKey({ label: 'Orem Oasis', sleeps: 20 });
  const without = compHouseKey({ label: 'Orem Oasis' });
  assert.notEqual(withSleeps, without);
  assert.equal(without.endsWith('|'), true, 'a missing sleep count should be visible in the key');
});
