import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { doorCodesForStay } from './part-door-codes.ts';

/*
 * The owner asked for **three door codes, one per Riverhouse part**, with same-night part combinations allowed (2026-11-10).
 *
 * `part-door-codes.ts` implements the decision and both the guest and cleaner routes pass `guide.partDoorCodes` into it, so
 * for a while this looked done. It was not: **nothing in the app could write the field.** `grep partDoorCodes` found the
 * type, two readers, the agent map and one test - and no editor, no client method and no form. So every part was "not set",
 * and every part guest was told to call for a code, which is the state the owner's answer was meant to replace.
 *
 * These guards pin the missing half: a host can set the codes, the value survives a save, and the decision it feeds still
 * refuses to hand a part guest the whole-house code.
 */

const EDITOR = readFileSync(join(process.cwd(), 'src', 'components', 'GuestAppEditor.tsx'), 'utf8');
const CLIENT = readFileSync(join(process.cwd(), 'src', 'lib', 'api.ts'), 'utf8');

test('a host can set a code for each part', () => {
  assert.match(EDITOR, /data-bot="part-door-codes"/, 'the editor has no per-part code section');
  // The three names must all be offered, and each input built from the part id so the fields are addressable.
  for (const part of ['main-lodge', 'recreation-wing', 'garage-suite']) {
    assert.ok(EDITOR.includes(`id: '${part}'`), `the editor does not offer a field for ${part}`);
  }
  assert.ok(EDITOR.includes('data-bot={`part-door-${id}`}'), 'the part fields are not addressable by a bot');
});

test('clearing a code removes the part rather than storing an empty string', () => {
  /*
   * An empty string would read as a code that is blank - `(input.partCodes?.[part] ?? '').trim()` treats it as missing, so
   * the guest outcome happens to be right, but the stored record would claim three parts are configured. Deleting the key is
   * the honest record, and the summary counts keys rather than truthiness.
   */
  assert.match(EDITOR, /delete next\[id\]/, 'an emptied field is stored as an empty string rather than removed');
  assert.match(EDITOR, /if \(value\) next\[id\] = value;/, 'the field does not branch on a real value');
});

test('the client type can carry the field, or the editor cannot save it', () => {
  assert.match(CLIENT, /partDoorCodes\?:/, 'the HouseGuide type has no partDoorCodes, so TypeScript drops the save');
});

test('the section is only offered where parts exist', () => {
  // The Ranch and Lindon are not sold in parts; three code boxes there would be decoration.
  assert.match(EDITOR, /house === 'river' && \(/, 'the per-part section is not scoped to the River House');
});

test('the host is told how many parts are sellable', () => {
  /*
   * "Two of three" is the fact that decides whether the third part can be sold tonight. A blank box does not say that on its
   * own, and a host reading three boxes with two filled has to do the arithmetic.
   */
  assert.match(EDITOR, /partDoorSummary/, 'the editor does not summarise the part codes');
  assert.match(EDITOR, /data-bot="part-door-summary"/, 'the summary is not drawn');
});

test('a part guest is still never handed the whole-house code', () => {
  /*
   * The guard that matters most, restated here because this turn added a writer. Nothing about adding a form may make the
   * fallback to the house code acceptable: that code opens every part.
   *
   * This **runs the decision** rather than reading its comments. An earlier version asserted on the prose in
   * `part-door-codes.ts` and passed while the fallback was reintroduced, because the comment explaining the rule was still
   * there. Fifth time this session a guard matched prose instead of behaviour, so this one calls the function.
   */
  const plan = doorCodesForStay({
    house: 'river',
    units: ['garage-suite'],
    houseCode: 'HOUSE-1234',
    partCodes: {},
  });
  assert.deepEqual(plan.codes, [], 'a part with no code of its own was given a code');
  assert.ok(plan.missing, 'a part with no code is not named as missing');
  assert.match(plan.missing!, /please do not use another part's entrance/, 'the guest is not warned off other entrances');
  // And a part that does have a code gets only that one - never the house code alongside it.
  const set = doorCodesForStay({
    house: 'river',
    units: ['garage-suite'],
    houseCode: 'HOUSE-1234',
    partCodes: { 'garage-suite': '3333' },
  });
  assert.deepEqual(set.codes, [{ label: 'River Garage Suite', code: '3333' }], 'the part guest got more than their own code');

  // The routes must still pass the stored codes through, or the writer above reaches nothing.
  const GUEST = readFileSync(join(process.cwd(), 'functions', 'api', 'stay-guide', '[token]', 'index.ts'), 'utf8');
  assert.match(GUEST, /partCodes: guide\.partDoorCodes/, 'the guest route stopped passing the part codes');
  const CLEAN = readFileSync(join(process.cwd(), 'functions', 'api', 'clean', '[token].ts'), 'utf8');
  assert.match(CLEAN, /partCodes: guide\.partDoorCodes/, 'the cleaner route stopped passing the part codes');
});

test('the save route keeps the field through its merge', () => {
  /*
   * `saveGuide` spreads `{...stored[id], ...guide}`, so a key present in the patch survives. Pinned because a future change
   * to an allow-list of fields would silently drop the codes - the exact failure this turn fixed, one layer down.
   */
  const STORE = readFileSync(join(process.cwd(), 'functions', '_lib', 'guest-guide.ts'), 'utf8');
  assert.match(STORE, /\.\.\.\(stored\[id\] \?\? \{\}\), \.\.\.guide/, 'the save merge no longer carries unknown fields');
});
