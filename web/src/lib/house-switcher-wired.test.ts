import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

/*
 * `/book/?house=…` is where every shared quote link lands, and it rendered one house with no way to look at the other
 * two. A guest deciding between the River House and the Ranch House had to go back to the list and lose their dates.
 *
 * The plan called for compact house-switcher pills. They were the one piece of it that never got built, and nothing
 * caught it: every test checked what was on the page, not what a guest could reach from it.
 *
 * These read the component, because the defect is a missing control rather than a wrong value.
 */

const LISTING = readFileSync(new URL('../components/HouseListing.tsx', import.meta.url), 'utf8');

test('every house page offers the other two', () => {
  assert.match(LISTING, /data-bot="house-switcher"/, 'the listing has no house switcher');
  assert.match(LISTING, /HOUSES\.map/, 'the switcher does not iterate the houses');
  assert.match(LISTING, /data-bot=\{`house-switch-\$\{id\}`\}/, 'a switcher link has no hook');
});

test('switching houses keeps the stay', () => {
  /*
   * The whole point. A switcher that drops `?in=&out=&guests=` sends the guest back to picking dates, which is the
   * problem it exists to fix. The href must carry `housePageSearch`.
   */
  const switcher = LISTING.slice(LISTING.indexOf('data-bot="house-switcher"'), LISTING.indexOf('data-bot="house-switcher"') + 1200);
  assert.match(switcher, /housePageSearch\(checkIn, checkOut, guests, children\)/, 'switching a house drops the chosen stay');
  assert.match(switcher, /\/houses\/\$\{id\}\//, 'the switcher does not link to a house page');
});

test('the current house is marked, not just styled', () => {
  // A reader using a screen reader needs to know which house the page is already showing.
  assert.match(LISTING, /aria-current=\{id === house\.id \? 'page' : undefined\}/, 'the current house is not marked for assistive tech');
});
