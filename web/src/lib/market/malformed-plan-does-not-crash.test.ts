import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/*
 * A malformed response unmounted the whole market page.
 *
 * Found by rendering `MarketBoard` in a harness: the server log showed
 *
 *   TypeError: Cannot read properties of undefined (reading 'send')
 *     > PushPlanPanel src/components/PushPlanPanel.tsx:342
 *   An error occurred in the <PushPlanPanel> component.
 *
 * `data.gate.send?.line` was optional on `send` but took `gate` for granted. Any response without `gate` - a truncated
 * read, a proxy page, an older deployment answering mid-release - threw during render, and React unmounted the tree. The
 * market board, the comp cards, and the approved sheet all disappeared because one nested field was missing.
 *
 * This is the same class the rebuild keeps finding: a guard that covers one level and not its neighbour. A 200 with the
 * wrong shape is not an error the caller reports, it is an error the caller renders into a blank page.
 */

const PANEL = readFileSync(join(process.cwd(), 'src', 'components', 'PushPlanPanel.tsx'), 'utf8');

/*
 * The file with comments removed.
 *
 * Every guard below looks at code, not prose. Three of them passed against a broken build because a comment quoted the old
 * form while explaining the bug, which is the same false-positive shape that recurred all session. Stripping comments once
 * here removes the whole class rather than patching each assertion.
 */
const CODE = PANEL.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('the gate line is optional at both levels', () => {
  // The old form was `data.gate.send?.line`: optional on `send`, not on `gate`.
  const matches = [...CODE.matchAll(/data\.gate(\??)\.send(\??)\.line/g)];
  assert.ok(matches.length > 0, 'the gate line expression is gone');
  for (const match of matches) {
    assert.equal(match[1], '?', '`gate` is dereferenced without an optional check');
    assert.equal(match[2], '?', '`send` is dereferenced without an optional check');
  }
});

test('the shadow-day count cannot throw either', () => {
  /*
   * It read `data.shadowDays.ready` and `data.shadowDays.days` unguarded, so a response missing `shadowDays` threw on the
   * same line, immediately after the gate fix.
   */
  /*
   * It read `data.shadowDays.ready` and `data.shadowDays.days` unguarded, so a response missing `shadowDays` threw on the
   * same line, immediately after the gate fix.
   *
   * The check is on the two things that actually matter rather than on a blanket ban: `ready` must be optional (it is the
   * condition itself), and every number must have a fallback so a missing field prints "0 of 7" instead of "undefined".
   */
  assert.equal(
    /data\.shadowDays\.ready/.test(CODE),
    false,
    'the shadow-day condition is dereferenced without an optional check',
  );
  assert.match(PANEL, /data\.shadowDays\?\.ready/, 'the shadow-day state is not optional');
  for (const match of CODE.matchAll(/data\.shadowDays\.(days|required)(?!\s*\?\?)/g)) {
    assert.fail(`a shadow-day count has no fallback and would print "undefined": ${match[0]}`);
  }
});

test('a response that is not a plan is reported as unreadable, not rendered', () => {
  /*
   * Guarding the render alone would leave the card showing blanks for a body it cannot use. The load path now refuses a
   * response without `gate` or `shadowDays`, so a host sees "could not be read" instead of a half-empty plan.
   */
  assert.match(PANEL, /const shapeOk =/, 'the load path accepts any JSON as a plan');
  assert.match(PANEL, /'gate' in result/, 'the shape check does not require `gate`');
  assert.match(PANEL, /'shadowDays' in result/, 'the shape check does not require `shadowDays`');
  assert.match(PANEL, /if \(!shapeOk\) \{\s*setState\('error'\)/, 'a bad shape does not put the card in its error state');
});

test('the error state is one a host can read and act on', () => {
  // The card already had this copy; the fix has to route into it rather than inventing a new silent branch.
  assert.match(PANEL, /data-bot="push-plan-error"/, 'there is no error line to fall into');
  assert.match(PANEL, /could not be read just now\. It is not empty/, 'the error line does not say the plan is not empty');
});
