/**
 * A booked night is booked, not "a one-night hole".
 *
 * The board's `action` could only ever be `hold`, `raise`, `promote`, or `locked` — `booked` and `closed` were in the type
 * and unreachable in fact. So a night that was **sold** reported `hold` with the reason "No stay can be booked on this date
 * — a one-night hole, or a stretch too short for the minimum."
 *
 * That sent a host to look for a gap that had already been sold, and it made the dashboard's own branch
 * `trialNight.action === 'booked' ? ' Our booking page leaves this night booked.'` dead code. Same class as the promotion
 * that was described and never computed: the surface could say the right thing and never did.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { buildMarketBoard } from './board.ts';
import { runShadow } from './shadow.ts';

const FROM = '2026-11-08';

function liveComp() {
  const byDate = new Map<string, number>();
  for (let i = 0; i < 70; i++) {
    const d = new Date(`${FROM}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    byDate.set(d.toISOString().slice(0, 10), 2400);
  }
  const index = new Map<string, Map<string, number>>();
  index.set('c1', byDate);
  return { comps: [{ id: 'c1', house: 'river' as const, name: 'Real comp' }], index };
}

function board(fill: { taken?: string[]; closed?: string[] } = {}) {
  return buildMarketBoard('river', FROM, 30, undefined, liveComp() as never, [], {
    pace: 'short',
    taken: fill.taken ?? [],
    closed: fill.closed ?? [],
  });
}

test('a booked night says it is booked', () => {
  const b = board({ taken: ['2026-11-20'] });
  const night = b.nights.find((row) => row.date === '2026-11-20');
  assert.ok(night);
  assert.equal(night!.action, 'booked', 'a sold night did not report itself as booked');
  assert.match(night!.reason, /already booked/, 'the reason does not say the night is sold');
  assert.doesNotMatch(night!.reason, /one-night hole/, 'a sold night was blamed on a gap');
  assert.equal(night!.promotionPercent, 0, 'a sold night carried a discount');
});

test('a closed night says it is closed', () => {
  const b = board({ closed: ['2026-12-01'] });
  const night = b.nights.find((row) => row.date === '2026-12-01');
  assert.ok(night);
  assert.equal(night!.action, 'closed', 'a blocked night did not report itself as closed');
  assert.match(night!.reason, /closed on the calendar/);
  assert.doesNotMatch(night!.reason, /one-night hole/, 'a blocked night was blamed on a gap');
});

test('booked and closed beat every market reason', () => {
  /*
   * A booked night inside 21 days with a short year is exactly what would otherwise promote. The calendar is what we hold
   * directly, so it wins — the order `guardNight` uses in the shadow run.
   */
  const b = board({ taken: ['2026-11-20', '2026-11-21'] });
  for (const date of ['2026-11-20', '2026-11-21']) {
    const night = b.nights.find((row) => row.date === date);
    assert.equal(night!.promotionPercent, 0, `${date} was promoted while booked`);
    assert.equal(night!.action, 'booked');
  }
});

test('an open night keeps its market action', () => {
  // The fix must not turn every night into a calendar action.
  const b = board({ taken: ['2026-11-20'] });
  const open = b.nights.filter((row) => row.date !== '2026-11-20' && row.action !== 'locked');
  assert.ok(open.length > 0, 'every night became a calendar action');
  for (const night of open) {
    assert.notEqual(night.action, 'booked', `${night.date} was called booked with nothing on it`);
    assert.notEqual(night.action, 'closed', `${night.date} was called closed with nothing on it`);
  }
});

test('the shadow run still counts the same nights the same way', () => {
  /*
   * `runShadow` guards the board, and the board now also reports `booked` and `closed`. A double-guard must not change the
   * counts — this is the regression risk of teaching the board a fact the shadow already knew.
   *
   * An earlier version of this test asserted zero promotions, which was wrong: open weekend nights inside 21 days are
   * supposed to promote. The claim that matters is that no promotion lands on the night that is taken or closed.
   */
  const taken = ['2026-11-20'];
  const closed = ['2026-12-01'];
  const b = board({ taken, closed });
  const run = runShadow(b, taken, false, FROM, 'short', closed);

  assert.equal(run.counts.booked, 1, `expected one booked night, got ${run.counts.booked}`);
  assert.equal(run.counts.closed, 1, `expected one closed night, got ${run.counts.closed}`);

  for (const date of ['2026-11-20', '2026-12-01']) {
    const night = run.nights.find((row) => row.date === date);
    assert.ok(night, `${date} is missing from the shadow run`);
    assert.equal(night!.promotionPercent, 0, `${date} was promoted while not sellable`);
  }

  // And the shadow's own line still reports honest counts.
  assert.match(run.digest, /booked left alone 1/);
});

test('the dashboard branch that mentions a booked night can now fire', () => {
  const UI = fs.readFileSync('src/components/MarketBoard.tsx', 'utf8');
  assert.match(UI, /trialNight\.action === 'booked'/, 'the dashboard no longer explains a booked night');

  const b = board({ taken: ['2026-11-20'] });
  assert.ok(
    b.nights.some((night) => night.action === 'booked'),
    'no night ever reports booked, so the dashboard branch is still dead code',
  );
});
