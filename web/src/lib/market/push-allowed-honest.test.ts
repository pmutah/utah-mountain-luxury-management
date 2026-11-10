import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { pushPlanAll, pushSendState, type PushGate } from './push.ts';
import { runShadow } from './shadow.ts';
import { buildMarketBoard } from './board.ts';

/*
 * **`allowed: true` on a build with no sender.**
 *
 * Walking the gate states turned this up. With the shadow week finished *and* a write token set, the plan returned
 * `allowed: true, hold: null` — while `pushSendState` on the same response said *"A rate still would not leave this
 * app: no sender is built."*
 *
 * The type comment read "True when the plan is allowed to run at all", and the panel emitted
 * `data-allowed="yes"`, which a bot would read as permission to push. Nothing can push. That is the same
 * label-with-nothing-behind-it shape that has recurred all through this work, on the one field a machine reads.
 *
 * The fix keeps `allowed` (callers and tests depend on it) and adds the two facts that make it honest:
 * `actionable` — the plan is clear to act on **by hand** — and `sends`, which is false at every gate state because no
 * sender exists.
 */

const run = runShadow(buildMarketBoard('lindon', '2026-11-08', 5), [], false, '2026-11-08', 'short');

const gate = (over: Partial<PushGate> = {}): PushGate => ({
  shadowReady: true,
  hasToken: true,
  paused: false,
  calendarReady: true,
  ...over,
});

/** Every combination of the gates that can exist. */
const STATES: Array<[string, PushGate]> = [
  ['everything open', gate()],
  ['no token', gate({ hasToken: false })],
  ['shadow unfinished', gate({ shadowReady: false })],
  ['calendar unread', gate({ calendarReady: false })],
  ['paused', gate({ paused: true })],
  ['nothing open', gate({ shadowReady: false, hasToken: false, calendarReady: false, paused: true })],
];

test('sends is false at every gate state, including the fully open one', () => {
  /*
   * The production case: everything open returned `allowed: true`. A host or bot reading that alone would believe a
   * rate could leave. It cannot, at any state, because no sender exists.
   */
  for (const [label, g] of STATES) {
    const plans = pushPlanAll([run], g, '2026-11-08');
    for (const plan of plans) {
      assert.equal(plan.sends, false, `${label}: a plan claimed it could send`);
    }
  }
});

test('the fully open gate still reports allowed, and says what that means', () => {
  const [plan] = pushPlanAll([run], gate(), '2026-11-08');
  assert.equal(plan!.allowed, true, 'the open gate should clear the plan to act on');
  assert.equal(plan!.actionable, true, 'actionable must agree with allowed when nothing blocks');
  /*
   * And the send state beside it still says this route does not send, so the two cannot be read as contradictory by
   * accident. It no longer says "no sender is built" — one exists now, on a separate route behind an off-by-default switch
   * — so the line names where publishing actually lives.
   */
  const line = pushSendState(gate()).line;
  assert.match(line, /does not leave this app from here/);
  assert.match(line, /separate route/);
});

test('a blocked gate is neither allowed nor actionable', () => {
  for (const [label, g] of STATES.filter(([name]) => name !== 'everything open')) {
    const [plan] = pushPlanAll([run], g, '2026-11-08');
    assert.equal(plan!.actionable, false, `${label}: a blocked plan was called actionable`);
    assert.equal(plan!.allowed, false, `${label}: a blocked plan was called allowed`);
  }
});

test('the panel never renders allowed as a send permission', () => {
  const panel = readFileSync(new URL('../../components/PushPlanPanel.tsx', import.meta.url), 'utf8');
  assert.match(panel, /data-sends="no"/, 'the panel dropped the machine-readable "nothing is sent" marker');
  assert.match(panel, /data-actionable=/, 'the panel does not expose what allowed means');
  assert.equal(
    /data-allowed=\{plan\.allowed \? 'yes' : 'no'\}[\s\S]{0,80}data-sends/m.test(panel),
    false,
    'the two markers are not adjacent',
  );
});


