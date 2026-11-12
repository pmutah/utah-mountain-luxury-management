/**
 * Reloading a quote used to switch houses.
 *
 * The listing kept the address in step with the stay by replacing the whole query with just the dates. On
 * `/book/?house=ranch&in=…` that **dropped `house=ranch`**, so:
 *
 *   - a reload rendered the River House, because the absent key defaults to River;
 *   - a link copied from the address bar pointed at the wrong house;
 *   - and on `/houses/river/` it left a stray `?in=…` query on a path that does not read one.
 *
 * A guest who reloaded a Ranch quote, or sent the address to their partner, silently got a different house at a
 * different price. These read the component, because the defect is in how the address is rewritten.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const LISTING = readFileSync(new URL('../components/HouseListing.tsx', import.meta.url), 'utf8');

/** The address-sync effect, pulled out so the assertions are about its body rather than the whole file. */
function syncEffect(): string {
  const at = LISTING.indexOf("params.set('house', house.id)");
  assert.ok(at > 0, 'the address sync no longer writes the house key');
  const start = LISTING.lastIndexOf('useEffect(', at);
  const end = LISTING.indexOf('}, [pageSearch', at);
  assert.ok(start >= 0 && end > start, 'the address sync effect could not be located');
  return LISTING.slice(start, end);
}

test('the address sync merges the stay into the existing query', () => {
  const effect = syncEffect();
  /*
   * The bug in one line: it used to build `pathname + pageSearch`, throwing away every other parameter. Reading the
   * existing search first is what keeps `house` (and anything else a link carried) alive.
   */
  assert.match(effect, /new URLSearchParams\(window\.location\.search\)/, 'the sync no longer reads the current query');
  assert.equal(
    /const next = `\$\{window\.location\.pathname\}\$\{pageSearch\}`/.test(effect),
    false,
    'the sync replaces the whole query again, dropping the house',
  );
});

test('the house key is written on the page that reads it', () => {
  const effect = syncEffect();
  // `/book/` is the only path that reads `?house=`; writing it elsewhere would put noise on a house URL.
  assert.match(effect, /onBookPath/, 'nothing checks whether this is the /book/ path');
  assert.match(effect, /params\.set\('house', house\.id\)/, 'the sync no longer writes the house key');
  assert.match(effect, /\/book\//, 'the /book/ path is not recognised');
});

test('a cleared date is removed rather than left behind', () => {
  /*
   * Merging without deleting would keep a stale checkout after a guest clears one, so the address would describe a stay
   * the page is not showing.
   */
  const effect = syncEffect();
  assert.match(effect, /params\.delete\(key\)/, 'a cleared date stays in the address');
  for (const key of ['in', 'out', 'guests', 'children']) {
    assert.ok(effect.includes(`'${key}'`), `the sync does not handle the ${key} key`);
  }
});

test('the effect recomputes when the house changes', () => {
  // Without `house.id` in the dependency list, switching houses would leave the old key in the address.
  assert.match(LISTING, /\}, \[pageSearch, house\.id\]\)/, 'the sync does not depend on the house, so a switch leaves a stale key');
});
