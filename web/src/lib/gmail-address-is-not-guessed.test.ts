import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/*
 * The app told a host to sign in as a mailbox it does not use.
 *
 * Verified on production 2026-11-10: `GET /api/esign/documents` reports the connected mailbox as **pmutah@gmail.com**, and
 * `gmailSend` builds its `From:` from those stored tokens. But four host-facing messages named
 * **utahmountainluxury@gmail.com**:
 *
 *   - `gmail-store.ts`       "Gmail is not connected. Connect utahmountainluxury@gmail.com in the dashboard."
 *   - `GuestsPanel.tsx`      "not connected — sign in as utahmountainluxury@gmail.com"
 *   - `DocumentsVault.tsx`   the same line
 *   - `book/index.ts`        the host alert's recipient
 *
 * A host following the first three would sign out of the working account and into an address the app never reads, and the
 * send would fail again — chasing a mailbox that is not the problem. The fourth is a real address choice and is left for the
 * owner to confirm; it is not a message, so it cannot mislead anyone about *which* account is connected.
 *
 * The app learns the connected address in exactly one place: Google's profile, stored with the tokens. So a message shown
 * before tokens exist must not name any address at all.
 */

/** The file with comments removed, so a comment quoting the old line cannot satisfy or trip a guard. */
function codeOnly(path: string): string {
  const text = readFileSync(join(process.cwd(), path), 'utf8');
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

test('the gmail-not-connected message names no mailbox', () => {
  const store = codeOnly('functions/_lib/gmail-store.ts');
  assert.equal(
    /utahmountainluxury/i.test(store),
    false,
    'the not-connected message names a mailbox the deployment may not use',
  );
  assert.match(store, /Gmail is not connected/, 'the not-connected message is gone');
  // It has to say where to fix it, or the host is left guessing.
  assert.match(store, /connect the guest mailbox|Connect the guest mailbox/i, 'the message gives no next step');
});

test('no host panel tells a host to sign in as a hardcoded address', () => {
  for (const path of ['src/components/GuestsPanel.tsx', 'src/components/DocumentsVault.tsx']) {
    const text = codeOnly(path);
    assert.equal(
      /utahmountainluxury/i.test(text),
      false,
      `${path} still names a hardcoded mailbox in a rendered message`,
    );
    assert.match(text, /connect the guest mailbox/i, `${path} lost its instruction`);
  }
});

test('the connected address is read from the tokens, not from copy', () => {
  /*
   * The one honest source. `tokens.email` comes from Google's profile, so it is the account that will actually send. Anything
   * else is a guess, and the guess was wrong.
   */
  const store = readFileSync(join(process.cwd(), 'functions/_lib/gmail-store.ts'), 'utf8');
  assert.match(store, /From: Utah Mountain Luxury <\$\{tokens\.email\}>/, 'the From address no longer comes from the tokens');
  assert.match(store, /profile\.emailAddress/, 'the stored mailbox address no longer comes from Google');
});

test('the addresses this app still writes to are named, and none is invented', () => {
  /*
   * Three sites deliberately address a mailbox rather than describe one:
   *
   *   - the direct-request host alert (`book/index.ts`)
   *   - the guest survey reply line (`survey-copy.ts`)
   *   - the e-sign support line (`esign-copy.ts`, `EsignCeremony.tsx`)
   *
   * They are pinned here by name so a fourth cannot appear unnoticed, and so that changing the real address is a deliberate
   * edit with a failing test to notice it. **They are all the same address on purpose** — if the owner confirms a different
   * inbox, this list is the one place to change.
   */
  const sites = [
    'functions/api/book/index.ts',
    'functions/_lib/survey-copy.ts',
    'functions/_lib/esign/esign-copy.ts',
    'src/components/EsignCeremony.tsx',
  ];
  for (const path of sites) {
    assert.match(
      codeOnly(path),
      /utahmountainluxury@gmail\.com/i,
      `${path} no longer addresses the guest mailbox; update this list if that was intended`,
    );
  }
  // And the reply address is one constant, so the survey body and header cannot drift apart.
  const survey = codeOnly('functions/_lib/survey-copy.ts');
  assert.match(survey, /export const SURVEY_REPLY_EMAIL = '([^']+)'/, 'the survey reply address is no longer one constant');
  /*
   * The *body* line must interpolate the constant rather than repeat an address. An earlier version of this guard matched
   * `SURVEY_REPLY_EMAIL` anywhere in the file, so it passed while the body hardcoded the address and the constant still
   * existed above - the same "identifier present somewhere" false positive that has recurred all session.
   */
  const bodyLine = /`\$\{SURVEY_REPLY_EMAIL\}[^`]*`/.test(survey);
  assert.equal(bodyLine, true, 'the survey body does not interpolate the reply constant');
  const literalInBody = /`[^`]*[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}[^`]*`/i.test(survey);
  assert.equal(literalInBody, false, 'an address is hardcoded in a template string instead of using the constant');
});
