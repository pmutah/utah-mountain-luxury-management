import assert from 'node:assert/strict';
import test from 'node:test';
import { applySplitMode, readSplitMode, SPLIT_MODES } from './river-split-mode.ts';
import type { RiverUnitId } from './river-units.ts';

/*
 * The split mode was parsed, echoed back, and changed nothing. A host who turned splitting off, or set the house to
 * suggest-only, got the identical answer - so the setting read as consent to a behaviour that happened regardless.
 *
 * These tests hold every mode to a defined effect on every engine choice.
 */

const units: RiverUnitId[] = ['garage-suite', 'main-lodge'];

test('an unknown or missing mode is auto, never something stricter by accident', () => {
  assert.equal(readSplitMode(undefined), 'auto');
  assert.equal(readSplitMode(''), 'auto');
  assert.equal(readSplitMode('nonsense'), 'auto');
  for (const mode of SPLIT_MODES) assert.equal(readSplitMode(mode), mode);
});

test('auto leaves the engine answer alone and says nothing about modes', () => {
  const applied = applySplitMode({ choice: 'split', units }, 'auto');
  assert.equal(applied.choice, 'split');
  assert.deepEqual(applied.units, units);
  assert.equal(applied.overridden, false);
  assert.equal(applied.modeLine, null);
});

test('off forces the whole house and says the parts are not offered', () => {
  const applied = applySplitMode({ choice: 'split', units }, 'off');
  assert.equal(applied.choice, 'whole');
  assert.deepEqual(applied.units, [], 'a part was still offered with splitting off');
  assert.equal(applied.overridden, true);
  assert.equal(applied.engineChoice, 'split', 'the engine choice was lost, so the cost is invisible');
  assert.match(applied.modeLine ?? '', /turned off/i);
  // The point of keeping the comparison is that the host can see what the setting costs.
  assert.match(applied.modeLine ?? '', /what the setting costs/i);
});

test('off also overrides a both answer', () => {
  const applied = applySplitMode({ choice: 'both', units }, 'off');
  assert.equal(applied.choice, 'whole');
  assert.deepEqual(applied.units, []);
  assert.equal(applied.overridden, true);
});

test('off changes nothing when the engine already held the house whole', () => {
  const applied = applySplitMode({ choice: 'whole', units: [] }, 'off');
  assert.equal(applied.choice, 'whole');
  assert.equal(applied.overridden, false, 'off claimed to override an answer it agreed with');
  assert.equal(applied.modeLine, null);
});

test('suggest-only keeps the answer but says nothing acts on it', () => {
  const applied = applySplitMode({ choice: 'split', units }, 'suggest-only');
  assert.equal(applied.choice, 'split');
  assert.deepEqual(applied.units, units);
  assert.equal(applied.overridden, false);
  assert.match(applied.modeLine ?? '', /advice/i);
  assert.match(applied.modeLine ?? '', /nothing offers the parts/i);
});

test('suggest-only on a whole answer still says it is only advice', () => {
  const applied = applySplitMode({ choice: 'whole', units: [] }, 'suggest-only');
  assert.equal(applied.choice, 'whole');
  assert.match(applied.modeLine ?? '', /advice/i);
});

test('every mode has a defined result for every engine choice', () => {
  const choices = ['whole', 'split', 'both'] as const;
  for (const mode of SPLIT_MODES) {
    for (const choice of choices) {
      const applied = applySplitMode({ choice, units: choice === 'whole' ? [] : units }, mode);
      assert.ok(['whole', 'split', 'both'].includes(applied.choice), `${mode}/${choice} produced no choice`);
      // Off is the only mode that may strip units from a splitting answer.
      if (mode !== 'off') assert.equal(applied.units.length, choice === 'whole' ? 0 : units.length, `${mode}/${choice} lost a unit`);
    }
  }
});

test('the applied units are a copy, so a caller cannot mutate the engine answer through it', () => {
  const applied = applySplitMode({ choice: 'split', units }, 'auto');
  applied.units.push('recreation-wing');
  assert.deepEqual(units, ['garage-suite', 'main-lodge'], 'the engine unit list was mutated');
});
