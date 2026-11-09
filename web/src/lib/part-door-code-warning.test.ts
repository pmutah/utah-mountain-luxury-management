import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

/*
 * Selling the Riverhouse in parts has a consequence nobody had said out loud: there is **one door code for the whole
 * building**. A guest booked into the Garage Suite holds a code that opens the Main Lodge, where a different guest may be
 * staying that same night.
 *
 * That is a host decision - fit separate locks, or do not sell parts on the same nights - but it has to be visible before
 * a price invites it, not discovered afterwards.
 *
 * Two things are checked here: that the access model really is house-level (so the warning is true), and that the pricing
 * panel says so (so it is not just in a commit message).
 */

const UNITS = readFileSync(new URL('./river-units.ts', import.meta.url), 'utf8');
const PANEL = readFileSync(new URL('../components/RiverUnitsPanel.tsx', import.meta.url), 'utf8');
const GUIDE = readFileSync(new URL('../../functions/_lib/guest-guide.ts', import.meta.url), 'utf8');

test('the door code is a house fact, not a unit fact', () => {
  /*
   * If units ever grow their own codes this warning becomes wrong in the safe direction and should be removed. This test
   * is the place that shows up.
   */
  const unitBlock = UNITS.slice(UNITS.indexOf('RIVER_UNIT_DETAIL'));
  assert.equal(/doorCode/.test(unitBlock), false, 'a unit now carries its own door code - update the warning');
  // And the guide holds one code per house.
  assert.match(GUIDE, /doorCode: string/, 'the guide no longer holds a house door code');
});

test('the pricing panel warns that one code opens every part', () => {
  assert.match(PANEL, /river-units-door/, 'the warning lost its hook');
  assert.match(PANEL, /One door code covers the whole building/, 'the warning no longer states the fact');
  assert.match(PANEL, /two strangers hold the same code/, 'the consequence is not spelled out');
});

test('the warning offers the host a way forward rather than only a problem', () => {
  // The sentence wraps in the JSX source, so the check runs on whitespace-collapsed text.
  const flat = PANEL.replace(/\s+/g, ' ');
  assert.match(flat, /Give each part its own lock, or keep the house whole/, 'no remedy is offered');
});
