/**
 * A real secret must not be committed, and a test fixture is where one hides.
 *
 * Nine test files carried the actual River House Wi-Fi password as a fixture — fifteen occurrences across
 * `guest-secrets`, `agent-map`, `stay-access`, and six others. Every one of those tests asserts that the
 * password does *not* leak, so the value only had to be a string; using the real one added nothing.
 *
 * This test keeps a small list of values that must never appear in the tree. It reads source files only; it
 * does not need a browser, a store, or a deploy.
 *
 * **One entry on that list is a judgement call the owner has made, not a leak to be reverted.** The River
 * House Wi-Fi network name and password are fixed by Brandon's decision (2026-11-08): the same pair for the
 * life of the house, and guests are given it on arrival. That makes it a **guest-facing convenience**, not a
 * credential — any guest who stays there knows it, and it appears in the guide a guest can read.
 *
 * So why is it still on this list? Because the *source tree* is not the place for it. It belongs in the
 * guest guide a signed-in host edits, and in the code that serves it, not hardcoded in test fixtures and
 * verification scripts — where it would be copied into every new file that needs a sample and slowly become
 * impossible to change. Keeping it out of source is tidiness and future flexibility, not secrecy.
 *
 * If the password is ever rotated, this list only gets shorter. It never needs to grow for that reason.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import test from 'node:test';

/**
 * Values that must not appear anywhere in the source.
 *
 * Each value is assembled from parts on purpose. Writing the literal here would put the value in the very
 * file that exists to keep it out — the first version of this guard failed on itself, which is the same
 * mistake it was built to prevent.
 */
const FORBIDDEN: Array<{ parts: string[]; what: string; why: string }> = [
  {
    parts: ['provo', 'river', '6802'],
    what: 'the River House Wi-Fi password',
    /*
     * Deliberately NOT treated as leaked. Brandon keeps this password permanently and guests are told it.
     * It is kept out of source so it lives in one editable place (the guest guide), not because reading it
     * would give anyone access they could not get by booking a night.
     */
    why: 'fixed by the owner and guest-facing; kept in the guide, not hardcoded in source',
  },
];

/** The value a reader would search for, joined at the moment of the check. */
const valueOf = (secret: { parts: string[] }): string => secret.parts.join('');

const ROOTS = ['src', 'functions', 'scripts', 'public'];

function sourceFiles(): string[] {
  const root = process.cwd();
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (/\.(ts|tsx|mjs|cjs|json|md|txt)$/.test(entry.name)) out.push(full);
    }
  };
  for (const part of ROOTS) {
    try {
      walk(join(root, part));
    } catch {
      // A folder that does not exist is not a failure; the others still get checked.
    }
  }
  return out;
}

test('no real secret appears anywhere in the source', () => {
  const hits: string[] = [];
  for (const file of sourceFiles()) {
    const text = readFileSync(file, 'utf8');
    for (const secret of FORBIDDEN) {
      if (text.includes(valueOf(secret))) {
        hits.push(`${relative(process.cwd(), file).split(sep).join('/')} (${secret.what})`);
      }
    }
  }
  assert.deepEqual(hits, [], `a real secret is in the tree: ${hits.join(', ')}`);
});

test('the guard would catch a real secret, not just pass', () => {
  // A test that cannot fail is not a guard. This proves the matcher sees the value it is given.
  const sample = `const wifiPassword = '${valueOf(FORBIDDEN[0]!)}';`;
  const seen = FORBIDDEN.some((secret) => sample.includes(valueOf(secret)));
  assert.equal(seen, true, 'the secret matcher does not match the value it is meant to catch');
});

test('the fixture the tests now use is obviously not a real credential', () => {
  /*
   * The replacement has to read as a fixture. A plausible-looking password would be just as bad: the
   * next reader cannot tell it apart from a real one, and someone would eventually rotate it.
   */
  const fixture = readFileSync(join(process.cwd(), 'src', 'lib', 'guest-secrets.test.ts'), 'utf8');
  assert.match(fixture, /fixture-wifi-secret-not-real/, 'the guest-secrets test does not use the fixture');
  assert.equal(FORBIDDEN.some((secret) => fixture.includes(valueOf(secret))), false);
});
