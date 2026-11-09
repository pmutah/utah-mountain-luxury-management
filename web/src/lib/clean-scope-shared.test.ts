import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanJobView, cleanSteps } from './clean-link.ts';
import { stepIds, stepRows } from './clean-progress.ts';
import { scopeStep } from './clean-scope.ts';
import { readFileSync } from 'node:fs';

/*
 * Last turn scoped the desk's cleaning steps to the parts a turn touches. The cleaner's own page builds its list
 * separately, so the person doing the work still read "Strip and remake every bed" after a two-bed stay — and the Spanish
 * toggle, which is the cleaner's, was never scoped at all.
 *
 * Two lists, one rule. These tests hold the cleaner's list to it, in both languages.
 */

const labels = (units: string[], lang: 'en' | 'es' = 'en') => cleanSteps(false, lang, units);

test('a whole-house turn keeps the whole-house steps', () => {
  const steps = labels([]);
  assert.equal(steps[0], 'Strip and remake every bed');
  assert.equal(steps[3], 'Bathrooms and towels');
});

test('a part turn scopes the beds and the bathrooms', () => {
  const steps = labels(['garage-suite']);
  assert.match(steps[0]!, /2 beds/);
  assert.match(steps[0]!, /Garage Suite/);
  assert.match(steps[0]!, /not the whole house/);
  assert.match(steps[3]!, /Garage Suite only/);
  assert.match(steps[3]!, /1 bath/);
});

test('the Spanish steps are scoped too, because the cleaner is the one who reads them', () => {
  const steps = labels(['garage-suite'], 'es');
  assert.match(steps[0]!, /2 camas/);
  assert.match(steps[0]!, /Garage Suite/);
  assert.match(steps[0]!, /no toda la casa/);
  assert.match(steps[3]!, /solo en Garage Suite/);
  assert.equal(/cada cama/.test(steps[0]!), false, 'the Spanish still says every bed');
});

test('generic steps are not rewritten in either language', () => {
  for (const lang of ['en', 'es'] as const) {
    const steps = labels(['garage-suite'], lang);
    assert.equal(steps[1], lang === 'es' ? 'Poner la ropa de cama a lavar' : 'Start the linens');
    assert.equal(steps[5], lang === 'es' ? 'Tomar una foto de cada cuarto antes de salir' : 'Photo each room before you leave');
  }
});

test('the cleaner page and the desk share one rule, so they cannot drift', () => {
  /*
   * They are two separate lists. The only reason they agree is that both call `scopeStep` from `clean-scope.ts`. If either
   * grows its own scoping, this fails.
   */
  const page = readFileSync(new URL('./clean-link.ts', import.meta.url), 'utf8');
  const desk = readFileSync(new URL('./clean.ts', import.meta.url), 'utf8');
  assert.match(page, /from '\.\/clean-scope'/, 'the cleaner page does not use the shared rule');
  assert.match(desk, /from '\.\/clean-scope'/, 'the desk does not use the shared rule');
  // And the rule itself must not import either of them back, which would be a cycle.
  const shared = readFileSync(new URL('./clean-scope.ts', import.meta.url), 'utf8');
  assert.equal(/from '\.\/clean'/.test(shared), false, 'the shared rule imports the desk - that is the cycle again');
  assert.equal(/from '\.\/clean-link'/.test(shared), false, 'the shared rule imports the cleaner page');
});

test('a part turn reaches the cleaner through the job view, not only the step list', () => {
  // The view is what the page renders; the step list alone would leave it unscoped on screen.
  const view = cleanJobView({ house: 'river', checkout: '2027-06-03', gapNights: 2, units: ['garage-suite'] });
  assert.match(view!.steps[0] ?? '', /2 beds/);
  assert.match(view!.stepRows[0]?.label ?? '', /2 beds/, 'the tickable rows are unscoped');
});

test('no parts, or every part, means the house', () => {
  assert.equal(scopeStep({ id: 'beds', label: 'Strip and remake every bed' }, undefined).label, 'Strip and remake every bed');
  assert.equal(
    scopeStep({ id: 'beds', label: 'Strip and remake every bed' }, ['garage-suite', 'recreation-wing', 'main-lodge']).label,
    'Strip and remake every bed',
  );
  assert.equal(scopeStep({ id: 'beds', label: 'x' }, ['attic']).label, 'x', 'an unknown part scoped somehow');
});

test('the tick ids are pinned, because saved progress is keyed by them', () => {
  /*
   * The cleaner's ticks are stored under these ids. `stepRows` derives from `stepIds`, so a reordering would move both
   * together and a rows-vs-ids comparison would pass while every saved tick landed on the wrong step. This pins the order
   * itself, which is the thing that must not change.
   */
  assert.deepEqual(stepIds(false), ['beds', 'linens', 'kitchen', 'baths', 'floors', 'photos']);
  assert.deepEqual(stepIds(true), ['window', 'beds', 'linens', 'kitchen', 'baths', 'floors', 'photos']);
});

test('scoping a label never changes the id a tick is saved under', () => {
  for (const sameDay of [false, true]) {
    const ids = stepIds(sameDay);
    const rows = stepRows(sameDay, 'en', ['garage-suite']);
    assert.deepEqual(rows.map((row) => row.id), ids, `sameDay=${sameDay}: the scoped rows no longer match the ids`);
    assert.deepEqual(stepRows(sameDay, 'en').map((row) => row.id), ids);
  }
});
