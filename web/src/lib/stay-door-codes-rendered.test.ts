/**
 * The guest portal draws every door it is entitled to.
 *
 * The route has sent `doorCodes` (one row per part) and `doorMissing` since the per-part work on 2026-11-10. The page drew only
 * `access.doorCode` — the first code — so a guest holding the Garage Suite **and** the Main Lodge was shown one door and left to
 * guess the other.
 *
 * Third instance of one shape in three turns: the cleaner's door code sent and never drawn, the cleaner's step rows
 * recomputed locally, and now the guest's second door. An API test proves the data is right and says nothing about whether the
 * surface agrees, so these guards read the page.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const PAGE = readFileSync('src/components/StayApp.tsx', 'utf8');
const CLIENT = readFileSync('src/lib/api.ts', 'utf8');

test('the guest page reads the per-part door codes', () => {
  /*
   * A source-text guard is weak on its own — disabling the block with `if (false)` leaves `access.doorCodes` and `doors.map`
   * in the file, so a text match still passes while the page draws nothing. I proved that: my first "does this guard bite"
   * probe disabled the branch and the test stayed green.
   *
   * So this checks the **shape that actually renders**: a conditional on `doors.length` whose truthy branch returns the
   * mapped rows. Moving the block or gating it off breaks the pattern.
   */
  assert.match(PAGE, /access\.doorCodes/, 'the page never reads the per-part codes the route sends');
  assert.match(
    PAGE,
    /if \(doors\.length > 0\) \{\s*return doors\.map\(/,
    'the codes are read but the rendered branch no longer returns them',
  );
});

test('a single-house stay still reads exactly as before', () => {
  /*
   * One code, labelled "Door code" — the label only names the part when there is more than one, so nothing about a normal stay
   * changes.
   */
  assert.match(PAGE, /doors\.length > 1 \? row\.label : 'Door code'/, 'a single code is labelled by part, which changes an ordinary stay');
  assert.match(PAGE, /access\.doorCode/, 'the single-code fallback is gone');
});

test('a part with no code set tells the guest to call', () => {
  assert.match(PAGE, /access\.doorMissing/, 'the page ignores the missing-code line the route sends');
  assert.match(PAGE, /data-bot="stay-door-missing"/, 'there is no element for the missing-code message');
});

test('the client type carries both fields, so the page can read them', () => {
  // The page could not have drawn these before the type allowed it — worth pinning so a type change cannot silently undo it.
  assert.match(CLIENT, /doorCodes\?: Array<\{ label: string; code: string \}>/, 'the client type has no per-part codes');
  assert.match(CLIENT, /doorMissing\?: string \| null/, 'the client type has no missing-code line');
});

test('the door block is still behind the rules gate', () => {
  /*
   * Nothing here may shorten the gate. The codes sit inside the `showCodes` branch, which is the same branch that requires the
   * window and the rules acknowledgement.
   */
  const idx = PAGE.indexOf('access.doorCodes');
  assert.ok(idx > 0);
  const before = PAGE.slice(Math.max(0, idx - 1200), idx);
  assert.match(before, /showCodes \?/, 'the codes are no longer inside the showCodes branch');
});

test('no guest-facing money appears in the door block', () => {
  const start = PAGE.indexOf('data-bot="stay-door"');
  const block = PAGE.slice(start, start + 1600);
  assert.equal(/\$\s?\d/.test(block), false, 'a price appears beside the door code');
});
