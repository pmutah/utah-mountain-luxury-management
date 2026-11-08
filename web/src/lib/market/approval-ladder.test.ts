import assert from 'node:assert/strict';
import test from 'node:test';
import { approvalBase, approvedGuestRate, MAX_DAILY_MOVE } from './rate-sheet.ts';
import { quoteStay } from '../quote.ts';
import { readFileSync } from 'node:fs';

/*
 * **The auto-pricing ladder broke at its second rung, and nothing caught it.**
 *
 * The 8% daily cap is deliberate: a night should not jump from $179 to $421 in one keystroke. It is measured
 * against the price being replaced. That is the published card the first time, and the **approved price** every
 * time after — and the code assumed those were always the same number.
 *
 *   - `buildMarketBoard` starts from the approved price, so it proposed $193 → $208.
 *   - the approve route validated against `nightAsk` (the $179 card) and refused $208, because $208 is not
 *     within 8% of $179.
 *
 * Measured on production: `POST {guest:193}` → 201, `POST {guest:208}` → 400, while the board said "propose
 * 208". So a night could be raised exactly once and never again, which put Lindon's $421 market median out of
 * reach by **any** number of approvals — the auto-pricing pillar was decorative on the one house that needed it
 * most. The quote path had the same bug in a quieter form: it would return null and show the guest the old
 * price, so a second approval would have looked saved and done nothing.
 */

const CARD = 179;
const FLOOR = 51;

test('the base is the approved price once a night has one, and the card before that', () => {
  assert.equal(approvalBase(CARD, []), CARD, 'an unpriced night is measured from the card');
  assert.equal(approvalBase(CARD, [{ guest: 193 }]), 193, 'a priced night is measured from its approved price');
  // A malformed row must not become the base; the card stands rather than an invented number.
  assert.equal(approvalBase(CARD, [{ guest: 0 }]), CARD);
  assert.equal(approvalBase(CARD, [{ guest: -5 }]), CARD);
});

test('the ladder climbs from $179 to the $421 market in single 8% steps', () => {
  /*
   * The whole point of the cap: it should take many days, and it should actually get there. Before the fix it
   * took one step and stopped.
   */
  let base = CARD;
  const steps: number[] = [];
  for (let i = 0; i < 20 && base < 421; i += 1) {
    const next = Math.round(base * (1 + MAX_DAILY_MOVE));
    const allowed = approvedGuestRate([{ date: '2026-12-09', guest: next }], '2026-12-09', {
      guest: base,
      floorGuest: FLOOR,
    });
    assert.notEqual(allowed, null, `the ladder refused $${next} from a base of $${base}`);
    steps.push(allowed!);
    base = allowed!;
  }
  assert.ok(base >= 421, `the ladder stopped at $${base} and never reached the $421 market`);
  assert.ok(steps.length > 5, 'the cap should require many steps, not one');
  // Every step stays inside the cap, which is the rule the cap exists to enforce.
  let previous = CARD;
  for (const step of steps) {
    assert.ok(step - previous <= Math.round(previous * MAX_DAILY_MOVE), `$${step} jumps more than 8% from $${previous}`);
    previous = step;
  }
});

test('a single jump to the market is still refused, because the cap is the point', () => {
  // Fixing the ladder must not remove the guard it was climbing under.
  assert.equal(
    approvedGuestRate([{ date: '2026-12-09', guest: 421 }], '2026-12-09', { guest: CARD, floorGuest: FLOOR }),
    null,
    'a first approval jumped straight to the market',
  );
  assert.equal(
    approvedGuestRate([{ date: '2026-12-09', guest: 250 }], '2026-12-09', { guest: 193, floorGuest: FLOOR }),
    null,
    'a second approval jumped more than 8%',
  );
});

test('the quote reads a second-step approval instead of silently showing the card', () => {
  /*
   * The quiet half of the bug. With the route fixed, an approval at $208 would save — and the quote would still
   * have returned null, so the guest saw $179. A silent fallback to a lower price is invisible to everyone.
   */
  const quote = quoteStay('lindon', '2026-12-09', '2026-12-10', [], {
    asOf: '2026-11-08',
    pace: 'short',
    sheet: [{ date: '2026-12-09', guest: 208 }],
  });
  const night = quote.nights[0]!;
  assert.equal(night.approved, true, 'the approved night fell back to the card');
  assert.equal(night.guest, 208, `the guest was quoted ${night.guest} instead of the approved 208`);
});

test('the route and the quote are given the same base', () => {
  /*
   * A structural check, because this defect was two files disagreeing rather than one file being wrong. If a
   * future change re-derives the base by hand in either place, this fails.
   */
  const route = readFileSync(new URL('../../../functions/api/pricing/approved-rates.ts', import.meta.url), 'utf8');
  const quote = readFileSync(new URL('../quote.ts', import.meta.url), 'utf8');
  assert.match(route, /approvalBase\(/, 'the approve route no longer measures from the approval base');
  assert.match(quote, /approvalBase\(/, 'the quote no longer measures from the approval base');
  assert.equal(
    /approvedGuestRate\(sheet,\s*iso,\s*\{\s*guest:\s*ask\.guest/.test(quote),
    false,
    'the quote went back to measuring against the card',
  );
});
