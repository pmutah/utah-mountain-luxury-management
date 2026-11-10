import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/*
 * The owner asked for the publishing sender to exist **with a host-controlled switch, left off** (2026-11-10).
 *
 * The sender and the switch were built, and the route that reaches them was guarded — but no host surface ever called
 * it. `grep publish-rates` over `src/**\/*.tsx` returned nothing. That is the same defect this rebuild keeps finding: a
 * capability that works and cannot be seen or reached, which for a *switch* is worse than absent, because the owner
 * believes he has control of publishing and does not.
 *
 * These guards pin the wiring rather than the prose:
 *
 *   1. the panel asks the route for the switch state, and
 *   2. the panel's send goes through the client method that POSTs it, behind a confirm, and
 *   3. the panel never claims publishing is on when the route said off.
 */

const PANEL = readFileSync(join(process.cwd(), 'src', 'components', 'PushPlanPanel.tsx'), 'utf8');
const CLIENT = readFileSync(join(process.cwd(), 'src', 'lib', 'api.ts'), 'utf8');
const ROUTE = readFileSync(join(process.cwd(), 'functions', 'api', 'pricing', 'publish-rates.ts'), 'utf8');

test('a host can see the publishing switch, not just the plan', () => {
  assert.match(PANEL, /api\s*\.\s*getPublishSwitch\(\)/, 'the panel never reads the switch state');
  assert.match(PANEL, /data-bot="publish-state"/, 'the switch state is not drawn');
  assert.match(PANEL, /data-bot="publish-switch"/, 'the switch block is not drawn');
});

test('the switch is read every load, so a host does not act on a stale state', () => {
  const effect = PANEL.slice(PANEL.indexOf('useEffect('));
  const body = effect.slice(0, effect.indexOf('}, []);'));
  assert.match(body, /loadSwitch\(\)/, 'the switch is not re-read when the card loads');
});

test('sending goes through the route, behind a second click', () => {
  assert.match(PANEL, /api\s*\.\s*publishRates\(\)/, 'the panel never calls the sender');
  // The first control only opens a confirm; the write is on the confirm button.
  assert.match(PANEL, /data-bot="publish-ask"/, 'there is no first click');
  assert.match(PANEL, /data-bot="publish-confirm"/, 'there is no confirm click');
  assert.match(PANEL, /data-bot="publish-cancel"/, 'the host cannot back out of the confirm');

  const ask = PANEL.indexOf('data-bot="publish-ask"');
  const confirm = PANEL.indexOf('data-bot="publish-confirm"');
  assert.ok(ask > 0 && confirm > 0, 'the two controls are not both present');
  // The ask button must not carry the write itself.
  const askBlock = PANEL.slice(ask, confirm);
  assert.equal(
    /void\s+publish\(\)/.test(askBlock),
    false,
    'the first click already sends, so the confirm is decorative',
  );
});

/**
 * The condition guarding a `data-bot` block.
 *
 * Matching the block's *text* is not enough: wrapping it in `{false && (` leaves every string in place and the guard
 * still passes, which this test did on its first run. So the check reads the expression that actually gates the block.
 */
function conditionBefore(source: string, marker: string, window = 400): string {
  const at = source.indexOf(marker);
  assert.ok(at > 0, `${marker} is not in the panel`);
  return source.slice(Math.max(0, at - window), at);
}

test('a refusal is shown with its reason, not as an empty success', () => {
  assert.match(PANEL, /data-bot="publish-refused"/, 'refused nights are not drawn');
  assert.match(PANEL, /row\.why/, 'a refused night is drawn without the route\'s reason');
  assert.match(PANEL, /data-ok=\{published\.ok \? 'yes' : 'no'\}/, 'the outcome does not say whether it worked');
});

test('an unreadable switch is not drawn as off', () => {
  const before = conditionBefore(PANEL, 'data-bot="publish-unread"');
  assert.match(
    before,
    /pubUnread && \(/,
    'the unread line is not gated on the failed read, so it would never show',
  );
  assert.equal(
    /\{false && \(/.test(before),
    false,
    'the unread line is in a dead branch, so the read can fail silently',
  );
  assert.match(
    PANEL,
    /not the same as off/i,
    'the unread state does not say it differs from off',
  );
});

test('the send button only renders when the route said the switch is on', () => {
  /*
   * The action block must sit in the **else** of `pub.switch === 'off'`, so an off switch cannot render a send. Checking
   * the block's presence alone passed on its first run while the block was changed to `{false ? (`; this reads the gate.
   */
  const before = conditionBefore(PANEL, 'data-bot="publish-action"', 900);
  assert.match(
    before,
    /pub\.switch === 'off' \?/,
    'the action block is not gated on the switch, so an off switch could render a send',
  );
  assert.equal(
    /\{false \?/.test(before),
    false,
    'the switch gate was replaced with a constant, so the block no longer depends on the route',
  );
});

test('the panel never states that publishing is on by itself', () => {
  // The state line must come from the route. A literal "Publishing is ON" in the component would be a second copy.
  assert.equal(
    /Publishing is ON/.test(PANEL),
    false,
    'the component hardcodes the on line instead of using the route\'s',
  );
  assert.match(PANEL, /\{pub\.line\}/, 'the state line is not the route\'s line');
});

test('the client reaches the real route and says GET does not publish', () => {
  assert.match(CLIENT, /'\/api\/pricing\/publish-rates'/, 'the client does not call the publish route');
  assert.match(CLIENT, /method:\s*'POST'/, 'the client has no POST for publishing');
  const getter = CLIENT.slice(CLIENT.indexOf('getPublishSwitch'), CLIENT.indexOf('publishRates'));
  assert.equal(/method:\s*'POST'/.test(getter), false, 'the GET helper sends, so reading the switch would publish');
  assert.match(getter, /publishes:\s*false/, 'the GET helper does not state that it publishes nothing');
});

test('the route still refuses with the switch off, and the panel depends on that', () => {
  assert.match(ROUTE, /if \(!gate\.on\)/, 'the route no longer refuses an off switch');
  assert.match(ROUTE, /409/, 'an off switch is not a refusal status');
});

test('a response without sent/refused does not crash the card', () => {
  /*
   * Found by clicking the real confirm in a harness: a response carrying no `sent`/`refused` threw on
   * `published.sent.length` and unmounted the whole pricing card, taking the plan and approved sheet with it.
   *
   * A first version of this guard matched `Array.isArray(result?.sent)` anywhere in the file and still passed after the
   * assignment was reverted to `result.sent` — the substring survived in the `outcomeUnknown` line. So it now reads the
   * assignment itself.
   */
  assert.match(
    PANEL,
    /sent:\s*Array\.isArray\(result\?\.sent\)\s*\?\s*result\.sent\s*:\s*\[\]/,
    'the stored `sent` is not normalised, so a response without it throws on .map/.length',
  );
  assert.match(
    PANEL,
    /refused:\s*Array\.isArray\(result\?\.refused\)\s*\?\s*result\.refused\s*:\s*\[\]/,
    'the stored `refused` is not normalised, so a response without it throws on .slice/.length',
  );
  assert.match(
    PANEL,
    /outcomeUnknown:\s*!Array\.isArray\(result\?\.sent\)\s*\|\|\s*!Array\.isArray\(result\?\.refused\)/,
    'the unreadable-outcome flag does not reflect both arrays',
  );
  assert.match(
    PANEL,
    /data-bot="publish-outcome-unknown"/,
    'an unreadable outcome renders as nothing, which reads as "nothing sent"',
  );
  // The render must read the normalised state, never the raw response.
  const renderBody = PANEL.slice(PANEL.indexOf('{published && ('));
  assert.match(renderBody, /published\.sent\.map/, 'the send rows are not drawn from the normalised state');
  assert.match(renderBody, /published\.refused\.slice/, 'the refused rows are not drawn from the normalised state');
});
