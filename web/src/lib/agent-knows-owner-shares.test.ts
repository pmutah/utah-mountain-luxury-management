import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

/*
 * Asked "how much does Todd get from the River House this year?", the co-host answered that it could not access financial
 * data for a rental property — and reached for the construction-only contributions tool. Rewriting the guidance did not
 * help: three versions of "use get_profit_summary, never get_partner_contributions" produced the identical refusal.
 *
 * What worked was putting the computed figure in the context, the same way approved prices and the mail state are. The
 * model answers from context and only calls a tool when it has to.
 *
 * Two things have to hold, and the second is the one that has bitten this session twice: the figure must be computed and
 * *inserted*, not merely computed.
 */

const PROMPT = readFileSync(new URL('../../functions/_lib/agent/system-prompt.ts', import.meta.url), 'utf8');

test('the owner shares are computed from the same metrics the desk uses', () => {
  assert.match(PROMPT, /calculateMetrics\(house, month/, 'the owner share is not computed from calculateMetrics');
  assert.match(PROMPT, /mergeAllExpenses\(env\)/, 'the owner share does not read the real expenses');
});

test('the computed owner shares reach the prompt', () => {
  // Computing the line and never inserting it is exactly how `parts` was lost on the request page.
  assert.match(PROMPT, /ownerLine,/, 'the owner line is computed but never added to the prompt');
});

test('a failed read says so rather than reporting zero', () => {
  // A zero here reads as "the house earned nothing", which is the mistake this line exists to prevent.
  assert.match(PROMPT, /Owner shares this year could not be read; say so rather than quoting a figure/, 'a failed read is silent');
  assert.match(PROMPT, /say so rather than quoting a figure/, 'a failed read does not tell the model to decline');
});

test('Lindon is left out, because it has no split', () => {
  // It is Brandon's house. Reporting a Todd share for it would invent a partner who is not there.
  assert.match(PROMPT, /for \(const house of \['ranch', 'river'\]/, 'a house with no split is in the loop');
  assert.match(PROMPT, /Lindon has no split/, 'the prompt does not say Lindon has no split');
});

test('the prompt sends an owner question away from the construction tool', () => {
  assert.match(PROMPT, /answer an owner-share question from this, not from get_partner_contributions/, 'the context does not say where to answer from');
  assert.match(PROMPT, /for a rental house it returns nothing, which is not the same as the house earning nothing/, 'the empty-construction-tool confusion is not called out');
});

test('the River opening date cannot be read as a zero-earning house', () => {
  assert.match(PROMPT, /opened on November 1 2026/, 'the prompt does not state the opening date as a reason for zero');
  assert.match(PROMPT, /never because it earned nothing/, 'a pre-opening zero is not distinguished from a real zero');
});
