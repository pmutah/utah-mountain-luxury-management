/**
 * One credential, one name — or the gate points at a secret that already exists.
 *
 * The rate-push gate checked `HOSPITABLE_WRITE_TOKEN`. The sender I built sends `HOSPITABLE_PAT`, and the PAT is what the owner
 * actually stored on the Pages project on 2026-11-10.
 *
 * So with the shadow week complete **and** the switch on, the plan would still have said "There is no Hospitable write token, so
 * a rate stays closed" — sending a host to look for a secret that was already configured, under a name nothing uses.
 *
 * Found by listing the project's secrets and comparing them with what the code reads. Nothing in the test suite could have caught
 * it: both names type-check, and every unit test supplies its own env.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const SENDER = readFileSync('src/lib/market/rate-publish.ts', 'utf8');
const PLAN = readFileSync('functions/api/pricing/push-plan.ts', 'utf8');
const SHADOW = readFileSync('functions/api/pricing/shadow-days.ts', 'utf8');

test('the sender uses the credential the project actually holds', () => {
  /*
   * `HOSPITABLE_PAT` is the stored secret, and the request must carry it. It now goes through `hospitableToken()`, which
   * prefers the PAT and falls back to the older `HOSPITABLE_WRITE_TOKEN`, because production was measured listing the PAT
   * while every route reported it absent at runtime — so accepting one name was a single point of wrong answers.
   *
   * The assertion follows the value rather than the literal: the header must be built from the accessor, and the accessor
   * must prefer the PAT.
   */
  assert.match(SENDER, /Authorization: `Bearer \$\{hospitableToken\(env\)\}/, 'the sender no longer sends through the token accessor');
  assert.match(
    SENDER,
    /return env\.HOSPITABLE_PAT\?\.trim\(\) \|\| env\.HOSPITABLE_WRITE_TOKEN\?\.trim\(\)/,
    'the accessor no longer prefers the PAT',
  );
  assert.match(SENDER, /const token = hospitableToken\(env\);/, 'the gate does not use the same accessor as the send');
});

test('the plan gate accepts the PAT, not only the older name', () => {
  /*
   * A host reading "no write token" while the PAT is set is the defect. Either name has to count, because the docs and other
   * routes still use the older one.
   */
  assert.match(PLAN, /hasToken: Boolean\(env\.HOSPITABLE_PAT\?\.trim\(\) \|\| env\.HOSPITABLE_WRITE_TOKEN\?\.trim\(\)\)/, 'the plan gate does not accept the PAT');
});

test('the shadow clock reports the same thing', () => {
  // `hasWriteToken` is shown beside the seven-day clock. Reporting only the older name made it read as unconfigured.
  assert.match(SHADOW, /hasWriteToken: Boolean\(env\.HOSPITABLE_PAT\?\.trim\(\) \|\| env\.HOSPITABLE_WRITE_TOKEN\?\.trim\(\)\)/, 'the shadow clock does not accept the PAT');
});

test('no route decides "is there a token" from one name alone', () => {
  /*
   * The general rule, so a third name appearing later fails here rather than shipping. Every boolean that answers "has a write
   * token" must consider both names.
   */
  const offenders: string[] = [];
  for (const [label, src] of [
    ['push-plan', PLAN],
    ['shadow-days', SHADOW],
  ] as const) {
    for (const match of src.matchAll(/Boolean\(env\.(HOSPITABLE_[A-Z_]+)(?:\?\.trim\(\))?\)/g)) {
      if (match[1] !== 'HOSPITABLE_PAT') offenders.push(`${label}: ${match[0]}`);
    }
  }
  assert.deepEqual(offenders, [], `a token check reads one name and ignores the PAT: ${offenders.join('; ')}`);
});
