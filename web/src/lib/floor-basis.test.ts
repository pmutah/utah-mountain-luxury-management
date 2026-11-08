import assert from 'node:assert/strict';
import test from 'node:test';
import { listPriceForHostNet, AIRBNB_KEEP, VRBO_KEEP } from '../../functions/_lib/pricing-doctrine.ts';

/*
 * The floor on the River House is $1,500 **host net**. Asked for the rate on 2026-12-13 the co-host
 * reported Airbnb $2,219 (correct), VRBO $2,039 (correct) — and then gave "$1,500" as the floor beside a
 * $2,219 guest rate, which puts a host-net figure in a guest-price slot. A host reading that could accept
 * a $1,500 guest price believing it was the floor, when $1,500 guest leaves only $1,268 of host net —
 * under the floor, by about $232 a night.
 *
 * These pin the two bases, and the channel fees that convert between them.
 */

test('the Airbnb guest price grosses a host net back up by the channel fee', () => {
  assert.equal(listPriceForHostNet(1875, AIRBNB_KEEP), 2219);
  // And the guest price really does leave the host net after the fee.
  assert.equal(Math.floor(2219 * AIRBNB_KEEP), 1875);
});

test('VRBO keeps more, so its guest price is lower for the same host net', () => {
  assert.equal(listPriceForHostNet(1875, VRBO_KEEP), 2039);
  assert.ok(
    listPriceForHostNet(1875, VRBO_KEEP) < listPriceForHostNet(1875, AIRBNB_KEEP),
    'VRBO should need a lower guest price than Airbnb for the same host net',
  );
  // The gap is real money, which is why the two must never be swapped.
  assert.equal(listPriceForHostNet(1875, AIRBNB_KEEP) - listPriceForHostNet(1875, VRBO_KEEP), 180);
});

test('a $1,500 guest price is under a $1,500 host-net floor, not equal to it', () => {
  const floorHost = 1500;
  const floorGuest = listPriceForHostNet(floorHost, AIRBNB_KEEP);
  assert.equal(floorGuest, 1776, 'the guest floor for $1,500 host net is $1,776');
  assert.ok(floorGuest > floorHost, 'the guest floor must be above the host floor');

  // What a host would actually keep on a $1,500 guest night — under the floor.
  const kept = Math.floor(1500 * AIRBNB_KEEP);
  assert.ok(kept < floorHost, `a $1,500 guest price leaves $${kept}, which is under a $1,500 host floor`);
});

test('the two keeps are the documented fees, not guesses', () => {
  assert.ok(Math.abs(AIRBNB_KEEP - 0.845) < 1e-9, 'Airbnb keep drifted from the documented 15.5% fee');
  assert.ok(Math.abs(VRBO_KEEP - 0.92) < 1e-9, 'VRBO keep drifted from the documented 8% fee');
});
