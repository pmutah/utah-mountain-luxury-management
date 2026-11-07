/**
 * The approved-rate sheet is the only path from the pricing engine to a guest, and the desk around
 * it had two holes these tests pin.
 *
 * The first: a host could approve a night and then had no way to see that the night was approved or
 * to take it back. `GET /api/pricing/approved-rates` and `DELETE` both existed and neither was
 * called from the UI, so an approval was one-way and invisible. A wrong approval meant editing
 * nothing and hoping.
 *
 * The second: the sheet's own cap could evict an approval without saying so — it used to erase a
 * whole house's sheet — and an approval that vanishes is worse than one that is refused, because
 * the guest then pays a price nobody chose.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { MAX_SHEET_NIGHTS, trimSheet, withApprovedRateReport } from './market/rate-sheet.ts';
import { nightAsk } from './market/rates.ts';

const PANEL = readFileSync(join(process.cwd(), 'src', 'components', 'PushPlanPanel.tsx'), 'utf8');
const ROUTE = readFileSync(
  join(process.cwd(), 'functions', 'api', 'pricing', 'approved-rates.ts'),
  'utf8',
);
const STORE = readFileSync(join(process.cwd(), 'functions', '_lib', 'pricing-store.ts'), 'utf8');

/** The panel with comments removed, so a comment about a control cannot satisfy a check for it. */
function panelCode(): string {
  return PANEL.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

test('the desk can read back every approved night, not just write them', () => {
  const code = panelCode();
  assert.match(code, /getApprovedRates\(/, 'the desk cannot read the approved sheet');
  assert.match(code, /clearApprovedRate\(/, 'the desk cannot take an approved night back');
  assert.match(code, /approved-sheet-night/, 'the desk does not render an approved night');
  assert.match(code, /approved-sheet-take-back/, 'there is no control to return a night to the card');
});

test('an unreadable sheet is not shown as an empty one', () => {
  /*
   * An empty sheet and an unreadable one look identical on screen but mean opposite things: one says
   * every night is on the card, the other says nobody knows. The panel keeps `null` for unreadable
   * and says so, the same way every ledger route on this branch already does.
   */
  const code = panelCode();
  assert.match(code, /approved === null|setApproved\(null\)/, 'the sheet has no unreadable state');
  assert.match(code, /could not be read\. They are not empty/, 'the unreadable sheet is not named');
});

test('the desk is told when the cap evicted a night', () => {
  const code = panelCode();
  assert.match(code, /result\.dropped > 0/, 'the panel ignores an eviction');
  assert.match(code, /furthest-out/, 'the panel does not say which nights the cap took');
  assert.match(ROUTE, /dropped: written\.dropped/, 'the route does not report an eviction');
  assert.match(ROUTE, /furthest-out/, 'the route does not say which nights the cap took');
});

test('the store returns the drop count instead of swallowing it', () => {
  // A save that reports only the sheet makes an eviction indistinguishable from a clean write.
  assert.match(STORE, /withApprovedRateReport/, 'the store does not report what the cap dropped');
  assert.match(STORE, /dropped: number/, 'the save result does not carry the drop count');
});

test('a save near the cap reports an eviction, and the evicted night is a far one', () => {
  const house = 'ranch' as const;
  const base = nightAsk(house, '2027-03-01').guest;
  let sheet = Array.from({ length: MAX_SHEET_NIGHTS }, (_, i) => {
    const date = new Date(Date.UTC(2027, 0, 1 + i)).toISOString().slice(0, 10);
    return { house, date, guest: base, approvedAt: '2026-11-07T12:00:00.000Z' };
  });

  // A night past the end of the sheet displaces the furthest night, not a near one.
  const far = withApprovedRateReport(sheet, {
    house,
    date: '2031-01-01',
    guest: base,
    approvedAt: '2026-11-07T12:00:00.000Z',
  });
  assert.equal(far.dropped, 1);
  assert.equal(far.sheet.length, MAX_SHEET_NIGHTS);
  assert.equal(far.sheet.some((r) => r.date === '2031-01-01'), false, 'the cap kept the night it evicted for');
  assert.equal(far.sheet.some((r) => r.date === '2027-01-01'), true, 'the cap dropped a near night');

  // A night already inside the sheet is a replace, so nothing is evicted.
  const replace = withApprovedRateReport(sheet, {
    house,
    date: '2027-01-01',
    guest: base + 10,
    approvedAt: '2026-11-07T12:00:00.000Z',
  });
  assert.equal(replace.dropped, 0, 'replacing a night was reported as an eviction');
});

test('trimming keeps every house, because one house is never worth erasing', () => {
  const houses = ['lindon', 'ranch', 'river'] as const;
  const rows = Array.from({ length: MAX_SHEET_NIGHTS + 30 }, (_, i) => {
    const date = new Date(Date.UTC(2027, 0, 1 + i)).toISOString().slice(0, 10);
    return houses.map((house) => ({ house, date, guest: 500, approvedAt: '2026-11-07T12:00:00.000Z' }));
  }).flat();
  const trimmed = trimSheet(rows);
  assert.equal(trimmed.sheet.length, MAX_SHEET_NIGHTS);
  for (const house of houses) {
    assert.ok(
      trimmed.sheet.some((r) => r.house === house),
      `${house} was erased by the trim`,
    );
  }
});
