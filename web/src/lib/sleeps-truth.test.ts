import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { SLEEPS, SLEEPS_TOGETHER } from './house-stay.ts';

/*
 * The River House was published as sleeping 25 everywhere in this app while the Airbnb listing said
 * "sleeps 24" in two places. A guest reading our booking page would be sold a party of 25 that the
 * channel would refuse, and the two would disagree about the same night.
 *
 * These tests do not re-read the listing (that needs the network, and a stale copy of the page would
 * be worse than no test). They pin the two things I can hold here: the number itself, so a change has
 * to be deliberate, and the absence of a second copy of it anywhere in the source.
 */

test('the River House sleeps 24, which is what the listing sells', () => {
  assert.equal(SLEEPS.river, 24);
  assert.equal(SLEEPS.ranch, 20);
  assert.equal(SLEEPS.lindon, 12);
});

test('the two-house total is derived, so it cannot go stale', () => {
  // This was hardcoded as "Ranch and River together sleep 45" in compound.ts. When the River dropped
  // to 24 the text would have kept saying 45, and the guard is that the number is never written down.
  assert.equal(SLEEPS_TOGETHER, 44);
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
        /\bsleeps 25\b/i,
        /house === 'river' \? 25/,
        /river: 25\b/,
        /\bSleeps 25\b/,
      ];
      for (const pattern of hits) {
        if (pattern.test(text)) offenders.push(`${rel} matches ${pattern}`);
      }
    }
  }

  assert.deepEqual(offenders, [], `a River sleep count is written down outside SLEEPS:\n${offenders.join('\n')}`);
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
