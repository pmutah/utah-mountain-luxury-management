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
  assert.equal(send.sends, false, 'an open gate claimed a send from this route');
  assert.match(send.line, /does not leave this app from here/i);
});

test('a missing token is named, and a token alone still does not mean a send', () => {
  const send = pushSendState({ ...READY, hasToken: false });
  assert.equal(send.sends, false);
  assert.match(send.line, /no write token/i);
  // The plan route never sends whatever the token says, and the line has to say where publishing actually lives.
  assert.match(send.line, /publish-rates/, 'the line does not point at the route that can publish');
});

test('setting the token never reads as turning publishing on', () => {
  const send = pushSendState({ ...READY, hasToken: true });
  assert.equal(send.sends, false);
  assert.match(send.line, /separate route/i, 'the line does not say publishing is a separate route');
  assert.match(send.line, /off unless the host turns it on/i, 'the line does not say publishing is off by default');
  assert.match(send.line, /Airbnb and VRBO/i, 'the line must say where a promotion is actually typed');
  assert.equal(/will send|is now live|pushing now/i.test(send.line), false, 'the copy promised a send');
});

test('the only Hospitable writer is the publish route, and it is behind the switch', () => {
  /*
   * This guard was written for the day a sender appeared: it used to fail if *anything* reached the Hospitable API, so that
   * the copy and the gate would be revisited together. That day came on 2026-11-10 — the owner asked for the sender with an
   * off-by-default switch — so the guard now pins the shape instead of the absence: exactly one file may call the API, it must
   * be the sender, and it must consult `publishSwitch` before it does.
   */
  const roots = ['functions', 'src/lib'];
  const writers: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.ts$/.test(entry) || /\.test\.ts$/.test(entry)) continue;
      const text = readFileSync(full, 'utf8');
      if (/api\.hospitable\.com/i.test(text)) writers.push(full.replace(/\\/g, '/'));
    }
  };
  for (const root of roots) walk(root);

  assert.deepEqual(
    writers,
    ['src/lib/market/rate-publish.ts'],
    `a Hospitable writer appeared somewhere unexpected: ${writers.join('; ')}`,
  );

  const sender = readFileSync('src/lib/market/rate-publish.ts', 'utf8');
  assert.match(sender, /publishSwitch\(env\)/, 'the sender does not consult the switch');
  assert.match(sender, /if \(!gate\.on \|\| gate\.unit === null\)/, 'the sender can run with the switch off');
});
