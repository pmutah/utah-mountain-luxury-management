import assert from 'node:assert/strict';
import test from 'node:test';
import { suggestRateAdjustment } from '../../../functions/_lib/pricing-doctrine.ts';

/*
 * **The AI's pricing engine had never heard of an approved rate.**
 *
 * There are two pricing engines in this repo. The board, the push plan, and the quote all read the approved sheet
 * (after the fixes above). `pricing-doctrine.ts` is the other one — it is what `suggest_rate_adjustment` returns,
 * and therefore what the co-host repeats when a host asks "what should I charge for this night".
 *
 * It never read the sheet at all. So after a host approved $193, the co-host recommended the card price, and once
 * the 8% ladder started working it would confidently recommend a number *lower* than the one already published.
 * A host asking the AI a direct pricing question got the answer this app had already superseded.
 *
 * Fixed at the source: an approved night is `hold` at the approved number, and the three appliers that run after
 * (`applyGoalPremium`, `applyFillPromotions`, `applyGapOffers`) all skip it, because a promotion on a night the
 * host priced would discount a number the host chose.
 */

function envWith(approved: Array<{ house: string; date: string; guest: number }>) {
  const store = new Map<string, string>();
  store.set(
    'approvedRates',
    JSON.stringify(approved.map((row) => ({ ...row, approvedAt: '2026-11-08T00:00:00.000Z' }))),
  );
  return {
    SETTINGS: {
      get: async (key: string) => store.get(key) ?? null,
      put: async (key: string, value: string) => {
        store.set(key, value);
      },
    },
  } as never;
}

test('an approved night comes back at the approved price, held, with no promotion', async () => {
  const result = await suggestRateAdjustment(envWith([{ house: 'lindon', date: '2026-11-20', guest: 193 }]), 'lindon', '2026-11-15', '2026-11-25');
  const night = (result.nights as Array<Record<string, unknown>>).find((row) => row.date === '2026-11-20')!;
  assert.equal(night.approved, true, 'the engine did not see the approval');
  assert.equal(night.listingHostNightly, 193, 'the engine reported a price other than the approved one');
  assert.equal(night.stance, 'hold', 'an approved night should be held, not proposed as a move');
  assert.equal(night.promotionPercent, null, 'an approved night was offered a discount');
});

test('the goal premium does not overwrite an approved price', async () => {
  /*
   * `applyGoalPremium` raises any night under its sell-out target. That is right for an unpriced night and wrong
   * for one the host set, so it must skip approvals.
   */
  const result = await suggestRateAdjustment(envWith([{ house: 'lindon', date: '2026-11-20', guest: 100 }]), 'lindon', '2026-11-15', '2026-11-25');
  const night = (result.nights as Array<Record<string, unknown>>).find((row) => row.date === '2026-11-20')!;
  assert.equal(night.listingHostNightly, 100, 'the goal premium replaced the approved price');
});

test('an unapproved night in the same window still gets the engine recommendation', async () => {
  // The guard must key on the approval, not switch the whole engine off.
  const result = await suggestRateAdjustment(envWith([{ house: 'lindon', date: '2026-11-20', guest: 193 }]), 'lindon', '2026-11-15', '2026-11-25');
  const other = (result.nights as Array<Record<string, unknown>>).find((row) => row.date === '2026-11-21')!;
  assert.equal(other.approved, undefined, 'a night with no approval was marked approved');
  assert.ok(other.listingHostNightly !== 193 || other.stance !== 'hold', 'the engine stopped recommending for other nights');
});

test("another house's approval does not reach this house", async () => {
  const result = await suggestRateAdjustment(envWith([{ house: 'ranch', date: '2026-11-20', guest: 999 }]), 'lindon', '2026-11-15', '2026-11-25');
  const night = (result.nights as Array<Record<string, unknown>>).find((row) => row.date === '2026-11-20')!;
  assert.notEqual(night.listingHostNightly, 999, "the Ranch approval priced a Lindon night");
  assert.notEqual(night.approved, true);
});

test('a paused read refuses with a reason instead of throwing at the model', async () => {
  /*
   * This engine reads a lot of KV, and a paused read used to escape as a throw — so the co-host saw a stack trace
   * rather than something it could say. The refusal now lives in the tool wrapper, where every other tool in this
   * file already refuses, and it never falls back to a made-up price.
   */
  const broken = {
    SETTINGS: {
      get: async () => {
        throw new Error('KV GET limit exceeded');
      },
      put: async () => undefined,
    },
  } as never;

  // The engine itself still throws: refusing loudly is the contract, and the wrapper is what translates it.
  await assert.rejects(() => suggestRateAdjustment(broken, 'lindon', '2026-11-15', '2026-11-25'));

  // And the wrapper turns that into a named refusal the model can repeat.
  const { executeAgentTool } = await import('../../../functions/_lib/agent/execute-tool.ts');
  const { result } = await executeAgentTool(broken, 'manage_pricing', {
    action: 'suggest_rate_adjustment',
    propertyId: 'lindon',
  });
  assert.equal(result.refused, true, 'a paused read did not refuse');
  assert.match(String(result.error ?? ''), /could not be read/);
  assert.equal('nights' in result, false, 'a refusal carried prices');
});
