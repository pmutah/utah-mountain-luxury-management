import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

/*
 * The co-host's context described the River House as a single 24-guest house and never mentioned the parts. Two wrong
 * answers followed, and both were the kind a host acts on:
 *
 *   - "can I still sell Saturday?" answered from the house calendar, which is taken as soon as any part is sold, so it
 *     said no while two parts were still for sale;
 *   - any question about part pricing had nothing to answer from.
 *
 * These are source guards because the defect was an omission from a string that is assembled at runtime.
 */

const PROMPT = readFileSync(new URL('../../functions/_lib/agent/system-prompt.ts', import.meta.url), 'utf8');

test('the prompt carries the part facts', () => {
  assert.match(PROMPT, /partPromptLines\(/, 'the prompt builds no part lines');
  assert.match(PROMPT, /\.\.\.partLines/, 'the part lines are built but never added to the prompt');
});

test('the prompt reads the part prices rather than assuming none', () => {
  assert.match(PROMPT, /loadRiverUnitRates/, 'the prompt never reads the part prices');
  // A failed read must not become "nothing is priced".
  assert.match(PROMPT, /partFacts\(null/, 'a failed read is not carried as unknown');
});

test('the River line admits the house is sold in parts', () => {
  const line = PROMPT.split(/\r?\n/).find((row) => row.includes('Provo Riverhouse'));
  assert.ok(line, 'the River property line is gone');
  assert.match(line, /three parts/, 'the River line still describes a single whole-house rental');
});

test('the part facts are built from the same stay list the prompt already has', () => {
  // Building them from a second source would let the AI and the calendar disagree.
  assert.match(PROMPT, /partFacts\(rates, spans, today/, 'the parts are computed off something other than the stays');
});

test('a part booking reaches the AI as a part, not as the whole house', () => {
  assert.match(PROMPT, /units: stay\.units/, 'the stay units are dropped before the parts are computed');
});
