import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { SLEEPS, SLEEPS_TOGETHER } from './house-stay.ts';

/*
 * The River House was published as sleeping 25 everywhere in this app while the Airbnb listing said
 * "sleeps 22" in two places. A guest reading our booking page would be sold a party that the channel would
 * refuse, and the two would disagree about the same night.
 *
 * The owner settled the number on 2026-11-10: **22**. Not 24-25 (an earlier spec with an expandable king and a
 * triple twin bunk that are not in the house), and the three parts now sum to 22 too, so the whole-house and
 * per-part routes agree.
 *
 * These tests do not re-read the listing (that needs the network, and a stale copy of the page would
 * be worse than no test). They pin the two things I can hold here: the number itself, so a change has
 * to be deliberate, and the absence of a second copy of it anywhere in the source.
 */

test('the River House sleeps 22, which is what the owner confirmed', () => {
  assert.equal(SLEEPS.river, 22);
  assert.equal(SLEEPS.ranch, 20);
  assert.equal(SLEEPS.lindon, 12);
});

test('the two-house total is derived, so it cannot go stale', () => {
  // This was hardcoded as "Ranch and River together sleep 42" in compound.ts. It has moved twice since
  // (River 25 -> 24 -> 22), and each time a written-down total would have kept the old figure, so the guard
  // is that the number is never written down.
  assert.equal(SLEEPS_TOGETHER, 42);
  const source = readFileSync(join(process.cwd(), 'src', 'lib', 'compound.ts'), 'utf8');
  assert.doesNotMatch(
    source,
    /together sleep \d/,
    'compound.ts writes the two-house total as a literal; it has to come from SLEEPS',
  );
});

test('no source file hardcodes a River sleep count of its own', () => {
  /*
   * Every surface reads SLEEPS now. A second copy is how this drifted: the number was written into
   * copy strings, an agent prompt, the listing title, and the comp-fit rule, and only some were
   * updated when it changed. This walks the non-test source and fails on the shapes that were wrong.
   */
  const roots = ['src/lib', 'src/components', 'functions/_lib'];
  const offenders: string[] = [];

  for (const root of roots) {
    const dir = join(process.cwd(), root);
    for (const file of walk(dir)) {
      if (file.endsWith('.test.ts')) continue;
      const text = readFileSync(file, 'utf8');
      const rel = file.slice(process.cwd().length + 1);
      // A literal River sleep count in prose or in code, other than the constant itself.
      const hits = [
        /\bsleeps 2[45]\b/i,
        /house === 'river' \? 2[45]/,
        /river: 2[45]\b/,
        /\bSleeps 2[45]\b/,
      ];
      for (const pattern of hits) {
        if (pattern.test(text)) offenders.push(`${rel} matches ${pattern}`);
      }
    }
  }

  /*
   * `part-stay.ts` is exempt on purpose: it detects a *legacy* whole-house claim in a stored note, so it has to recognise
   * the older counts (22, 24, and 25) to replace them for a part guest. Its pattern is asserted separately, below.
   */
  const filtered = offenders.filter((line) => !line.startsWith('src/lib/part-stay.ts matches'));
  assert.deepEqual(filtered, [], `a River sleep count is written down outside SLEEPS:\n${filtered.join('\n')}`);

  // And the exemption is narrow: the file must still recognise every historical count, or a stale note survives.
  const partStay = readFileSync(join(process.cwd(), 'src', 'lib', 'part-stay.ts'), 'utf8');
  assert.match(
    partStay,
    /\\bsleeps 2\[245\]\\b/,
    'part-stay no longer recognises the older whole-house sleep counts, so a legacy note would survive onto a part guest page',
  );
});

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSafe(dir)) {
    if (entry.endsWith('.test.ts')) continue;
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
