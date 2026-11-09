import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

/*
 * The split route parsed `mode`, echoed it back, and let it change nothing. All three modes returned the identical
 * answer, so a host who turned splitting off still read "offer parts" — a setting that reads as consent to a behaviour
 * that happens regardless.
 *
 * These are source guards, because the defect was a parsed value with no effect rather than a wrong number inside a
 * function. The behaviour of each mode is covered in river-split-mode.test.ts.
 */

const ROUTE = readFileSync(new URL('../../functions/api/pricing/river-split.ts', import.meta.url), 'utf8');
const PANEL = readFileSync(new URL('../components/RiverSplitPanel.tsx', import.meta.url), 'utf8');

test('the route applies the mode to the decision instead of only echoing it', () => {
  assert.match(ROUTE, /applySplitMode\(/, 'the route never applies the mode');
  assert.match(ROUTE, /choice: applied\.choice/, 'the applied choice never reaches the response');
  assert.match(ROUTE, /units: applied\.units/, 'the applied units never reach the response');
});

test('the route reports what was overridden, so an override is not silent', () => {
  assert.match(ROUTE, /engineChoice: applied\.engineChoice/, 'the engine choice is not reported');
  assert.match(ROUTE, /overridden: applied\.overridden/, 'an override is not reported');
  assert.match(ROUTE, /modeLine: applied\.modeLine/, 'the mode explanation is not reported');
});

test('the mode is read through the shared reader, so an unknown value is not stricter by accident', () => {
  assert.match(ROUTE, /readSplitMode\(/, 'the route parses the mode by hand again');
  assert.equal(/MODES\.includes/.test(ROUTE), false, 'a hand-rolled mode check is back');
});

test('the panel can switch the mode and saves the choice', () => {
  /*
   * This used to assert that the panel sent the mode with every GET. That was right when the mode was component state
   * and wrong once it was stored: sending `auto` on load would override the saved setting on every reload, which is the
   * defect the persistence work removed. The panel now loads without a mode and saves a change explicitly.
   */
  assert.match(PANEL, /river-split-mode-/, 'the panel has no mode control');
  assert.match(PANEL, /saveRiverSplitMode\(next\)/, 'the chosen mode is never saved');
});

test('the panel shows an override rather than quietly changing its answer', () => {
  assert.match(PANEL, /river-split-overridden/, 'an override has no line of its own');
  assert.match(PANEL, /data\.engineChoice/, 'the panel does not name what the engine wanted');
  assert.match(PANEL, /river-split-modeline/, 'suggest-only has no way to say it is advice');
});
