import assert from 'node:assert/strict';
import test from 'node:test';
import { workOrderRules, workOrderNotes, workOrderLeaving } from './clean.ts';
import type { HouseId } from './market/types.ts';

/*
 * Spanish on the cleaner's phone is keyed by the **exact English text** - `RULES_ES['Quiet hours ...']`, `NOTES_ES['Septic. ...']`.
 * So editing a single English sentence silently drops that line to English, and the cleaner reads a mixed-language
 * checklist with nothing saying why.
 *
 * That nearly happened this session: the River house rule began "Whole-house rental only", the fix removed those words,
 * and the Spanish key had to be updated by hand in the same commit. Nothing would have failed if I had forgotten.
 *
 * These tests make the failure loud. They do not translate anything; they check that every published Spanish line is
 * actually Spanish.
 */

const HOUSES: HouseId[] = ['river', 'ranch', 'lindon'];

/**
 * Spanish text carries accents, or Spanish function words that English does not share.
 *
 * The first version included `in` and `no`, which are also English words, so it called
 * "Quiet hours in this mountain neighborhood. No parties." Spanish. Every word here is one English does not use.
 */
function looksSpanish(text: string): boolean {
  if (/[áéíóúñ¿¡]/i.test(text)) return true;
  return /\b(de|del|el|la|los|las|solo|sólo|con|para|una|que|se|niños|nada|pero|sin|sobre|cuando|también)\b/i.test(text);
}

test('every published Spanish rule is actually Spanish', () => {
  for (const house of HOUSES) {
    for (const line of workOrderRules(house, 'es')) {
      assert.ok(looksSpanish(line), `${house} rule fell back to English: ${line.slice(0, 100)}`);
    }
  }
});

test('every published Spanish note is actually Spanish', () => {
  for (const house of HOUSES) {
    for (const line of workOrderNotes(house, 'es')) {
      assert.ok(looksSpanish(line), `${house} note fell back to English: ${line.slice(0, 100)}`);
    }
  }
});

test('every published Spanish checkout line is actually Spanish', () => {
  for (const house of HOUSES) {
    for (const line of workOrderLeaving(house, 'es')) {
      assert.ok(looksSpanish(line), `${house} checkout line fell back to English: ${line.slice(0, 100)}`);
    }
  }
});

test('the English text still says the things the Spanish is keyed to', () => {
  /*
   * A spot check of the two strings that changed this session. If either is reworded again, the Spanish key has to move
   * with it, and this test is where that shows up.
   */
  const riverRules = workOrderRules('river', 'en');
  assert.ok(
    riverRules.some((rule) => /Quiet hours in this mountain neighborhood/.test(rule)),
    'the River quiet-hours rule was reworded; move its Spanish key with it',
  );
  const septic = workOrderNotes('river', 'en').find((note) => /septic/i.test(note));
  assert.ok(septic, 'the River septic note is gone');
  assert.match(septic!, /^Septic\. /, 'the septic note title changed; its Spanish key is "Septic. ..."');
});

test('a house with no Spanish at all is caught, not silently passed', () => {
  // Proves the check has teeth: an obviously English sentence must fail `looksSpanish`.
  assert.equal(looksSpanish('Quiet hours in this mountain neighborhood. No parties.'), false);
  assert.equal(looksSpanish('Horas de silencio en este vecindario.'), true);
});
