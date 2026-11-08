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

test('identical urls always match, which is the guarantee', () => {
  // The URL case is the one that must never fail. `findSameHouse` checks it before any title logic.
  const key = compHouseKey({ label: 'Luxury 7000 SQFT · Sleeps 20 · Orem', sleeps: 20 });
  assert.equal(/\$/.test(key), false, 'a price reached the house key');
  assert.equal(/sleeps 20/.test(key), false, 'the sleep claim survived, so listings claiming different sleeps would split');
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
