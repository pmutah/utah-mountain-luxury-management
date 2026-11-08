import assert from 'node:assert/strict';
import test from 'node:test';
import { executeAgentTool } from './execute-tool.ts';
import type { AgentEnv } from './types';

/*
 * Audited after the mortgage bug, because a wrong money figure that looks checked is the worst thing
 * this product can say.
 *
 * Two figures turn out to be correct and to differ by design:
 *   - Ranch 2026 year-to-date **house profit** is +$5,288.72 (revenue less mortgage, cleaning, operating)
 *   - Todd's **owner share** for the same period is −$3,090.13 (after the 20% fee, then split 50/50)
 *
 * The difference is $8,378.96. Returned bare as `profit`, the first reads as "what you made", which for
 * a partner is wrong. The tool now returns the figure with its basis and the split rule beside it, so
 * the model has to pass that on rather than picking one and hoping.
 */

type Store = Map<string, string>;

function envWith(store: Store): AgentEnv {
  return {
    SETTINGS: {
      async get(key: string) {
        return store.get(key) ?? null;
      },
      async put(key: string, value: string) {
        store.set(key, value);
      },
    } as unknown as KVNamespace,
  } as AgentEnv;
}

async function profitSummary() {
  const { result } = await executeAgentTool(envWith(new Map()), 'manage_finances', {
    action: 'get_profit_summary',
    startMonth: '2026-01',
    endMonth: '2026-11',
    propertyId: 'ranch',
  });
  return result as {
    totalRevenue: number;
    totalProfit: number;
    byProperty: Record<string, { revenue: number; profit: number }>;
    basis?: string;
    ownerSplitNote?: string;
  };
}

test('the profit summary states whose profit it is', async () => {
  const result = await profitSummary();

  assert.ok(result.basis, 'the response does not say what totalProfit means');
  assert.match(
    String(result.basis),
    /house profit/i,
    'the basis does not name the figure as house profit',
  );
  assert.match(
    String(result.basis),
    /not a partner share/i,
    'the basis does not warn that this is not a partner share',
  );
  assert.match(
    String(result.ownerSplitNote ?? ''),
    /20% management fee/i,
    'the split rule is not stated, so the two figures cannot be told apart',
  );
  assert.match(String(result.ownerSplitNote ?? ''), /50\/50/, 'the 50/50 split is not stated');
});

test('the house profit and the revenue are both house figures, and profit is not the revenue', async () => {
  /*
   * These are deliberately relational, not hardcoded. With no KV this test runs against the seed
   * ledger, which holds different totals from production (seed Ranch revenue is $88,234.94, production
   * is $70,067.77). The first version pinned the production numbers and failed here for that reason —
   * a test that only passes with the live store is testing the store, not the code.
   *
   * What must hold in either dataset: profit is a real subtraction from revenue, and it is the house
   * figure rather than a partner share.
   */
  const result = await profitSummary();
  const ranch = result.byProperty.ranch!;

  assert.ok(ranch.revenue > 0, 'the seed ledger produced no Ranch revenue');
  assert.notEqual(
    Math.round(ranch.profit * 100) / 100,
    Math.round(ranch.revenue * 100) / 100,
    'profit equals revenue, so no cost was subtracted',
  );
  // House profit is revenue less costs, so it must sit below revenue for a year with a mortgage.
  assert.ok(
    ranch.profit < ranch.revenue,
    `house profit ${ranch.profit} is not below revenue ${ranch.revenue}`,
  );
  // The tool reports the house figure for the requested house, not a different one.
  assert.equal(
    Object.prototype.hasOwnProperty.call(result.byProperty, 'ranch'),
    true,
    'the requested house is missing from byProperty',
  );
});

test('a house with no owner split says so rather than implying one', async () => {
  const result = await profitSummary();
  // The note names which houses split and which does not; Lindon must not be left ambiguous.
  assert.match(
    String(result.ownerSplitNote ?? ''),
    /Lindon is Brandon only/i,
    'the split note does not say Lindon has no partner split',
  );
});
