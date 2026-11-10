import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { goalGapIsBeyondMarket, GOAL_GAP_MARKET_MULTIPLE } from './revenue-goals.ts';

/*
 * The annual-goal card presented arithmetic as a price.
 *
 * Measured on production 2026-11-10, from `/api/pricing/yield-plan`:
 *
 *   house   stillNeeded  open nights  "ask"   comp median  our published rate
 *   ranch   $64,011      ~40          $1,920  $417         $640
 *   lindon  $15,205      ~40          $456    $356         $179
 *   river   $362,810     ~40          $1,300  $1,166       $2,219
 *
 * The card read "$64,011 left across 40 open nights. Ask $1,920 after fees" - which is the goal divided by the nights
 * remaining. That is not a price. The Ranch's comps ran $245-$1,201 with a median near $515, and our own published rate
 * was $640, so the sentence asked a host to price 3x the market.
 *
 * The fix is not to withhold the goal. It is to stop calling the gap a rate once it is far outside the market, and to name
 * the market figure instead, because that is the number a host can act on.
 */

const PANEL = readFileSync(join(process.cwd(), 'src', 'components', 'RevenueGoals.tsx'), 'utf8');

test('a gap far above the market is not presented as a rate', () => {
  // The real Ranch shape: $1,920 needed per night against a $417 market.
  assert.equal(goalGapIsBeyondMarket(1920, 417), true, 'the Ranch case is not flagged');
  // Lindon's gap ($456) is 1.28x its $356 market - close enough to be a real rate to work toward.
  assert.equal(goalGapIsBeyondMarket(456, 356), false, 'a gap inside the market band is flagged as impossible');
});

test('the threshold is a stated multiple, not a magic number in the sentence', () => {
  assert.equal(GOAL_GAP_MARKET_MULTIPLE, 1.5);
  assert.equal(goalGapIsBeyondMarket(1000, 600), true, '1000 vs 600 is 1.67x and should be flagged');
  assert.equal(goalGapIsBeyondMarket(900, 600), false, '900 vs 600 is exactly 1.5x and should not be flagged');
});

test('an unknown market never produces a verdict', () => {
  /*
   * The market figure is read asynchronously. While it is unknown the card must keep its original wording rather than
   * decide the gap is impossible - "we have not read the market yet" is not "the market is far below this".
   */
  assert.equal(goalGapIsBeyondMarket(1920, null), false);
  assert.equal(goalGapIsBeyondMarket(null, 417), false);
  assert.equal(goalGapIsBeyondMarket(1920, 0), false, 'a zero market figure is unknown, not a comparison');
});

test('the card names the market figure when it refuses the gap as a rate', () => {
  assert.match(PANEL, /goalGapIsBeyondMarket\(/, 'the card never checks the gap against the market');
  /*
   * Scoped to the refusal branch itself. Matching `marketHostNightly` anywhere passed while the comparison was replaced
   * with `false`, because the identifier still appeared in the declaration - the same false-positive shape as the
   * dead-branch guards. The assertions below read the branch that the host actually sees.
   */
  const branchStart = PANEL.indexOf('? `');
  const refusal = PANEL.slice(branchStart, PANEL.indexOf('Price with the market on the Market tab'));
  assert.ok(branchStart > 0 && refusal.length > 40, 'the refusal branch could not be located');
  assert.match(refusal, /comparable houses here charge/, 'the refusal does not name the market');
  assert.match(refusal, /more than pricing can close/, 'the card does not say the gap is beyond pricing');
  assert.match(
    refusal,
    /formatWhole\(marketHostNightly \?\? 0\)/,
    'the refusal does not print the market figure itself',
  );
});

test('the market figure actually reaches the card', () => {
  /*
   * A comparison against a value nothing supplies is the same "label with nothing behind it" defect in a new place: the
   * branch would never fire and the old sentence would stay. The assignment is what has to survive, not the identifier -
   * an earlier version of this test passed with `marketHostNightly = null` because the name still appeared elsewhere.
   */
  assert.match(PANEL, /getYieldPlan\(/, 'the card never loads a market figure');
  assert.match(PANEL, /compHostNetMedian/, 'the card does not read the comp median the route already returns');
  assert.match(
    PANEL,
    /const marketHostNightly = market\[id\] \?\? null;/,
    'the market figure is declared but not taken from the loaded medians',
  );
  // One request, not one per house.
  assert.equal(
    (PANEL.match(/getYieldPlan\(/g) ?? []).length,
    1,
    'the card asks for the yield plan more than once',
  );
});

test('a failed market read falls back to the old wording instead of a wrong verdict', () => {
  assert.match(PANEL, /\.catch\(\(\) =>/, 'a failed market read is not handled');
  assert.match(PANEL, /setMarket\(\{\}\)/, 'a failed market read leaves stale figures in place');
});

test('the branch is recorded on the element, so a test can see which one ran', () => {
  assert.match(PANEL, /data-beyond-market=/, 'the card does not record which branch it took');
});
