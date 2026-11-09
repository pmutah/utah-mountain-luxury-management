import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { houseRules } from './house-rules.ts';
import { workOrderRules } from './clean.ts';

/*
 * "Whole-house rental only" was a published River House rule. It stopped being true when the house became sellable in
 * parts, and it rendered directly above the new part line — so a Garage Suite guest read "this stay is for the Garage
 * Suite" and "whole-house rental only" on the same screen.
 *
 * A rule that contradicts the booking is worse than no rule: the guest either doubts the booking or assumes they rented
 * the house. So the phrase is gone from every copy of the rule, and the Spanish translation is keyed by the exact live
 * text, which is the part that silently breaks if only the English is edited.
 */

const FILES = [
  'house-rules.ts',
  'clean.ts',
  '../../functions/_lib/guest-guide.ts',
  '../../functions/_lib/operations-store.ts',
];

test('no copy of the River rule still says the house is whole-house only', () => {
  for (const name of FILES) {
    const text = readFileSync(new URL(name, import.meta.url), 'utf8');
    // The comment explaining the removal is allowed to name the phrase; a live string is not.
    const live = text
      .split(/\r?\n/)
      .filter((line) => !line.trimStart().startsWith('*') && !line.trimStart().startsWith('//'))
      .join('\n');
    assert.equal(/Whole-house rental only/i.test(live), false, `${name} still publishes the rule`);
  }
});

test('the published River rule still says the things that are true', () => {
  const river = houseRules('river').map((rule) => rule.text).join(' ');
  assert.match(river, /Quiet hours/);
  assert.match(river, /No parties/);
  assert.match(river, /No smoking indoors/);
  assert.match(river, /septic/i);
});

test('the Spanish translation is keyed to the live rule, so it does not silently fall back to English', () => {
  const es = workOrderRules('river', 'es')[0] ?? '';
  const en = workOrderRules('river', 'en')[0] ?? '';
  // If the key drifts, the Spanish lookup misses and returns the English text unchanged.
  assert.notEqual(es, en, 'the Spanish rule fell back to English');
  assert.match(es, /Horas de silencio/);
  assert.equal(/Whole-house rental only|Solo la casa completa/i.test(es), false, 'the Spanish rule still says whole-house only');
});

test('the English rule comes back unchanged', () => {
  const en = workOrderRules('river', 'en');
  assert.equal(en.length, 1);
  assert.match(en[0] ?? '', /Quiet hours/);
});
