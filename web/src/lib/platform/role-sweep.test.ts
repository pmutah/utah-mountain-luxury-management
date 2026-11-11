/**
 * The role sweep, proven to fail when a route stops filtering.
 *
 * A guard that passes is only evidence if it can fail. This test breaks one route on a temporary copy, runs the real check script, and
 * asserts it names that route — then restores the file. The check itself is the one `npm run check:guards` runs.
 *
 * The defect it guards: the owner role was filtered on `/api/expenses` and `/api/reservations` and nowhere else, so the Overview tab, the
 * booking inbox, and the guest list each returned Lindon with the guest's name. Fixing those one at a time is how the same hole kept
 * reappearing; the check makes every guest-data route declare its answer.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(process.cwd());
const script = join(root, 'scripts/check-route-guards.cjs');
const target = join(root, 'functions/api/surveys/index.ts');

function runCheck(): { ok: boolean; output: string } {
  try {
    const output = execFileSync(process.execPath, [script], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, output };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string };
    return { ok: false, output: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

test('the check passes on the real tree', () => {
  const result = runCheck();
  assert.equal(result.ok, true, `the guard check fails on a clean tree:\n${result.output}`);
  assert.match(result.output, /Route guard check passed/);
});

test('the check fails when a guest-data route stops filtering by role', () => {
  /*
   * `surveys/index.ts` returns the guest list. Removing its `stripHouses` call is exactly the regression, so the check must name it.
   * The file is restored in a `finally`, and the assertion on the restore is part of the test — leaving a mutated route behind would be
   * worse than the bug.
   */
  const original = readFileSync(target, 'utf8');
  assert.match(original, /stripHouses\(/, 'the fixture route does not filter by role to begin with, so this test proves nothing');
  try {
    /*
     * Remove **every** role helper the route uses, not just one. After the guard learned to accept `allowedHouses(`, a sabotage that only
     * renamed `stripHouses(` left a role reference behind and the check passed — a sabotage that does not sabotage.
     */
    const sabotaged = original
      .replace(/stripHouses\(/g, 'passthrough(')
      .replace(/stripPortfolioHouses\(/g, 'passthrough(')
      .replace(/allowedHouses\(/g, 'passthrough(')
      .replace(/mayReadHouse\(/g, 'passthrough(')
      .replace(/resolveCaller\(/g, 'passthrough(');
    writeFileSync(target, sabotaged, 'utf8');
    const broken = runCheck();
    assert.equal(broken.ok, false, 'the check passed with an unfiltered guest list');
    assert.match(broken.output, /surveys\/index\.ts/, 'the check did not name the route that lost its filter');
    assert.match(broken.output, /does not filter by role/);
  } finally {
    writeFileSync(target, original, 'utf8');
  }
  // And the tree is clean again.
  const restored = readFileSync(target, 'utf8');
  assert.equal(restored, original, 'the fixture route was not restored');
  assert.equal(runCheck().ok, true, 'the check still fails after the restore');
});

test('every exemption in the guard carries a reason', () => {
  /*
   * The exemption list is the part that rots: a route added to it without a reason becomes a permanent hole. Each entry is required to be
   * more than a placeholder, and the list is required to stay short.
   *
   * The list is parsed by locating the `GUEST_DATA_OK` map and reading the quoted pairs inside it, rather than by scanning the whole file —
   * a broad regex over the script picked up unrelated string pairs and reported 68 "exemptions".
   */
  const source = readFileSync(script, 'utf8');
  const block = /const GUEST_DATA_OK = new Map\(\[([\s\S]*?)\n\]\);/.exec(source);
  assert.ok(block, 'the guard has no exemption list');
  const entries = [...block![1]!.matchAll(/\[\s*'([^']+\.ts)',\s*([\s\S]*?)\],\s*(?=\[|$)/g)];
  assert.ok(entries.length > 0, 'the exemption list parsed to nothing');
  /*
   * 21 today, and the cap is deliberately tight rather than generous. Every entry is a route that returns guest data and does not filter a
   * list — one-row lookups behind `mayReadHouse`, cleaner tokens, or aggregate figures. A new entry should force somebody to argue for it,
   * so raising this number is the moment to re-read the list.
   */
  assert.ok(
    entries.length <= 21,
    `the exemption list has grown to ${entries.length}; each one is a route with no list filter, so a new one needs a reason and a raised cap`,
  );
  for (const [, file, reason] of entries) {
    const text = reason!.replace(/'\s*\+\s*'/g, '').replace(/'/g, '').trim();
    assert.ok(text.length > 40, `${file} is exempt with no real reason (${text.length} chars)`);
  }
});
