import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { RIVER_UNIT_DETAIL } from './river-units.ts';
import { partsSleeps } from './party-fits-parts.ts';
import { SLEEPS } from './house-stay.ts';

/*
 * The part capacities drifted across three surfaces in three turns: the booking gate allowed a party of 25 for all
 * three parts, the card printed 25, and the guest-count hint offered 24. Each fix patched one surface, because nothing
 * held the number in one place.
 *
 * `sleeps-truth.test.ts` already does this for the *house* capacity: it pins the number and fails on any second copy.
 * The parts had no equivalent, so the same drift was free to happen to them. This is that guard.
 *
 * Two things are held here:
 *
 *   1. The parts' capacity comes from one table, and nothing else writes those numbers down.
 *   2. Every combination of parts is consistent with the house: no set may promise more than the house holds.
 */

const PART_SLEEPS = new Map(RIVER_UNIT_DETAIL.map((unit) => [unit.id as string, unit.sleeps]));

test('the part capacities are pinned, so a change has to be deliberate', () => {
  // These come from the Airbnb drafts. If one changes, this test is the place to record why.
  assert.equal(PART_SLEEPS.get('garage-suite'), 4);
  assert.equal(PART_SLEEPS.get('recreation-wing'), 8);
  assert.equal(PART_SLEEPS.get('main-lodge'), 13);
});

test('no combination of parts promises more than the house holds', () => {
  /*
   * This is the invariant behind all three defects. The parts add up to more than the house, so the *sum* is not a
   * capacity — the house is. `partsSleeps` returns the capped figure and this asserts it never exceeds SLEEPS.river.
   */
  const ids = RIVER_UNIT_DETAIL.map((unit) => unit.id);
  const combos: Array<Array<(typeof ids)[number]>> = [];
  for (let mask = 1; mask < 1 << ids.length; mask += 1) {
    combos.push(ids.filter((_, index) => mask & (1 << index)));
  }
  for (const combo of combos) {
    const shown = partsSleeps(combo);
    assert.ok(
      shown <= SLEEPS.river,
      `${combo.join('+')} promises ${shown}, more than the house's ${SLEEPS.river}`,
    );
    // And it never claims more than the parts themselves actually hold.
    const raw = combo.reduce((sum, id) => sum + (PART_SLEEPS.get(id as string) ?? 0), 0);
    assert.ok(shown <= raw, `${combo.join('+')} claims ${shown} but its parts hold ${raw}`);
  }
});

test('no source file hardcodes a part capacity of its own', () => {
  /*
   * Only the table may name the numbers. A literal "sleeps 4" beside a part, or a rule like `=== 13`, is how the house
   * capacity drifted before the sleeps-truth guard existed.
   *
   * The fixtures file is exempt: it invents *sample comps*, whose sleep counts are deliberately unrelated to our units.
   */
  const roots = ['src/lib', 'src/components', 'functions/_lib', 'functions/api'];
  const exempt = new Set([
    'src/lib/river-units.ts',
    'src/lib/market/fixtures.ts',
    // Prose for bots: it cannot import the table, so it is verified against the table in the next test instead.
    'functions/_lib/agent/site-map.ts',
  ]);
  const offenders: string[] = [];

  for (const root of roots) {
    for (const file of walk(join(process.cwd(), root))) {
      const rel = file.slice(process.cwd().length + 1).replace(/\\/g, '/');
      if (rel.endsWith('.test.ts') || exempt.has(rel)) continue;
      const text = readFileSync(file, 'utf8');
      // A part named beside a number, in prose or in code: "Garage Suite ... 4", "main-lodge sleeps 13".
      const patterns = [
        /\bgarage[- ]suite\b[^.\n]{0,24}\b4\b/i,
        /\brecreation[- ]wing\b[^.\n]{0,24}\b8\b/i,
        /\bmain[- ]lodge\b[^.\n]{0,24}\b13\b/i,
      ];
      for (const pattern of patterns) {
        if (pattern.test(text)) offenders.push(`${rel} matches ${pattern}`);
      }
    }
  }

  assert.deepEqual(offenders, [], `a part capacity is written down outside river-units.ts:\n${offenders.join('\n')}`);
});

test('the agent map names the right part capacities, since prose cannot read the table', () => {
  /*
   * The site map is prose for bots, so it cannot import the table - but it can be checked against it. It listed
   * "(sleeps 4, 1BR)", "(sleeps 8, 3BR)" and "(sleeps 13, 4BR)" as literals, which is exactly the drift this guard
   * exists to catch, so it is verified here instead of being excused.
   */
  const map = readFileSync(join(process.cwd(), 'functions', '_lib', 'agent', 'site-map.ts'), 'utf8');
  for (const unit of RIVER_UNIT_DETAIL) {
    const line = `${unit.name} (sleeps ${unit.sleeps}, ${unit.bedrooms}BR)`;
    assert.ok(
      map.includes(line),
      `the agent map does not say "${line}", so a bot is told a capacity the table does not hold`,
    );
  }
});

test('the house guard and the parts guard agree about the house', () => {
  // Both read SLEEPS.river, so a change to one cannot leave the other on the old number.
  const all = RIVER_UNIT_DETAIL.map((unit) => unit.id);
  assert.equal(partsSleeps(all), SLEEPS.river);
});

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSafe(dir)) {
    const path = join(dir, entry);
    if (statSafe(path) === 'dir') out.push(...walk(path));
    else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) out.push(path);
  }
  return out;
}

function readdirSafe(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

function statSafe(path: string): 'dir' | 'file' | 'none' {
  try {
    return statSync(path).isDirectory() ? 'dir' : 'file';
  } catch {
    return 'none';
  }
}
