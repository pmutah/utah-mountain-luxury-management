import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

/*
 * The co-host told me a guest email would not send "because the manage_operations tool does not have an action to
 * automatically send check-in emails". The real reason is that the mailbox cannot send at all — so a host reading that
 * answer would try to send it by hand and fail again, with nothing explaining why.
 *
 * The prompt had no mail state in it. It even said accepting a request "books the stay AND emails the guest a
 * confirmation", which is false on a deployment where the mailbox is broken.
 */

const PROMPT = readFileSync(new URL('../../functions/_lib/agent/system-prompt.ts', import.meta.url), 'utf8');

test('the prompt carries the real email state', () => {
  assert.match(PROMPT, /gmailHealth/, 'the prompt does not read the mailbox health');
  assert.match(PROMPT, /mailLine/, 'the prompt builds no mail line');
  assert.match(PROMPT, /Email: \*\*cannot send\*\*/, 'the prompt cannot say email is broken');
});

test('the mail state comes from the same path a real send takes', () => {
  /*
   * `gmailHealth` runs the token refresh a send would run, so it cannot report a working mailbox that then fails. A
   * simpler check - "is there an email string" - is what once read "connected" while every send failed.
   */
  assert.match(PROMPT, /await gmailHealth\(env, tokens\)/, 'the mail state is not read from gmailHealth');
});

test('an unreadable mail state says so rather than assuming either way', () => {
  assert.match(PROMPT, /Email: state could not be read/, 'a failed read claims nothing');
  assert.match(PROMPT, /Email: state unknown/, 'the default claims nothing');
});

test('the prompt no longer promises that accepting emails the guest', () => {
  /*
   * Checked against the live text, not the whole file: the comment explaining this fix quotes the old sentence, and the
   * guard would otherwise fail on its own explanation.
   */
  const live = PROMPT.split(/\r?\n/)
    .filter((line) => {
      const t = line.trimStart();
      return !t.startsWith('*') && !t.startsWith('//') && !t.startsWith('/*');
    })
    .join('\n');
  assert.equal(
    /Accepting books the stay AND emails the guest a confirmation/.test(live),
    false,
    'the prompt still promises an email that may not send',
  );
  assert.match(live, /tries to email the guest a confirmation/, 'accepting does not say the send is an attempt');
  assert.match(live, /read it before telling a host the guest was emailed/, 'the prompt does not send the model to the mail line');
});

test('a broken mailbox tells the model what to say instead', () => {
  const block = PROMPT.slice(PROMPT.indexOf('let mailLine'));
  assert.match(block.slice(0, 1200), /copy the link from the Guests page or text it/, 'no workaround is given');
  assert.match(block.slice(0, 1200), /Never tell a host a guest was emailed/, 'the prohibition is missing');
});
