import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pushHold, pushSendState, type PushGate } from './push.ts';

/*
 * The desk was told "A write token exists on this deployment" once `HOSPITABLE_WRITE_TOKEN` was set, and
 * the agent map described the token as what a push waits for. Both read as *it will now push*.
 *
 * It would not. The token is only ever read to compute the `hasToken` boolean, and this codebase has no
 * Hospitable client and no outbound price call. A fully open gate builds a payload and stops. That is a
 * missing **sender**, not a missing credential, and the difference decides whether the owner waits for a
 * key or commissions code.
 */

const READY: PushGate = { shadowReady: true, hasToken: true, paused: false, calendarReady: true };

test('an open gate clears the plan but still reports that nothing sends', () => {
  // The plan is allowed: that is the preview, and dropping it would hide what would change.
  assert.equal(pushHold(READY), null, 'a fully open gate should not hold the plan');

  const send = pushSendState(READY);
  assert.equal(send.sends, false, 'an open gate claimed a send that does not exist');
  assert.match(send.line, /no sender is built/i);
});

test('a missing token is named, and is not the only reason nothing sends', () => {
  const send = pushSendState({ ...READY, hasToken: false });
  assert.equal(send.sends, false);
  assert.match(send.line, /no write token/i);
  assert.match(send.line, /no sender is built/i, 'the missing sender was hidden behind the missing token');
});

test('nothing in the codebase writes a rate to Hospitable', () => {
  /*
   * A guard for the day someone builds the sender: this test fails and forces the copy and the gate to be
   * revisited together, rather than the UI continuing to deny a capability that now exists.
   */
  const roots = ['functions', 'src/lib'];
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.ts$/.test(entry) || /\.test\.ts$/.test(entry)) continue;
      const text = readFileSync(full, 'utf8');
      // An outbound write would need a Hospitable URL or a request carrying the token.
      if (/api\.hospitable\.com/i.test(text)) offenders.push(`${full}: hospitable API host`);
      if (/HOSPITABLE_WRITE_TOKEN\s*\}/.test(text) || /Authorization[^\n]*HOSPITABLE_WRITE_TOKEN/.test(text)) {
        offenders.push(`${full}: sends the token in a request`);
      }
    }
  };
  for (const root of roots) walk(root);

  assert.deepEqual(
    offenders,
    [],
    `a Hospitable writer may now exist — revisit pushSendState and the panel copy: ${offenders.join('; ')}`,
  );
});
