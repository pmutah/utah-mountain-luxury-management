/**
 * A promotion must not land on a night nobody can book.
 *
 * The shadow run has always refused this — `bookableNights` holds a one-night hole, and a lone Friday with the Saturday
 * taken, out of the plan. When I wired the fill promotion into the market board I left that guard behind, so the board
 * would have promoted nights the shadow run had just held. Two surfaces, two answers, which is how a host learns to
 * distrust both.
 *
 * The board now takes the same check, and names it as the reason before the floor, because a night no stay can reach is
 * the actionable fact — telling a host "the floor is why" would send them to the wrong place.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMarketBoard } from './board.ts';

const FROM = '2026-11-08';

/** A live comp watching the window, so the band is measured rather than invented. */
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

function board(fill: { taken?: string[]; closed?: string[]; pace?: 'short' | 'met' } = {}) {
  return buildMarketBoard('river', FROM, 40, undefined, liveComp() as never, [], {
    pace: fill.pace ?? 'short',
    taken: fill.taken ?? [],
    closed: fill.closed ?? [],
  });
}

test('a night inside a closed block is not promoted', () => {
  /*
   * Nov 20–21 are a weekend inside 21 days, which is exactly what the fill rule promotes. Blocking them must stop it.
   */
  const open = board();
  const promotedOpen = open.nights.filter((night) => night.promotionPercent === 20).map((night) => night.date);
  assert.ok(promotedOpen.includes('2026-11-20'), 'the fixture no longer promotes the weekend it depends on');

  const blocked = board({ closed: ['2026-11-20', '2026-11-21'] });
  for (const night of blocked.nights) {
    if (night.date !== '2026-11-20' && night.date !== '2026-11-21') continue;
    assert.equal(night.promotionPercent, 0, `${night.date} was promoted while the house was closed`);
  }
});

test('a booked night is not promoted', () => {
  const booked = board({ taken: ['2026-11-20', '2026-11-21'] });
  for (const night of booked.nights) {
    if (!['2026-11-20', '2026-11-21'].includes(night.date)) continue;
    assert.equal(night.promotionPercent, 0, `${night.date} was promoted while booked`);
  }
});

test('a closed night says why in terms a host can act on', () => {
  /*
   * Not "the floor is why" — that sends a host to the pricing panel when the real problem is a block. And not "no stay can
   * be booked" either: since the board learned to report `closed`, the honest answer is that the night is closed, which is
   * more specific than a generic gap. This test originally pinned the vaguer wording.
   */
  const blocked = board({ closed: ['2026-11-20'] });
  const night = blocked.nights.find((row) => row.date === '2026-11-20');
  assert.ok(night, 'the date is missing from the board');
  assert.match(night!.reason, /closed on the calendar/, 'the reason does not say the night is closed');
  assert.doesNotMatch(night!.reason, /floor is \$/, 'the reason blames the floor for a blocked night');
  assert.doesNotMatch(night!.reason, /one-night hole/, 'a blocked night was blamed on a gap');
});

test('a missing calendar is "not known", not "nothing is bookable"', () => {
  /*
   * `bookable === null` must not behave like "every night is unreachable" — that would silently disable promotion for
   * every caller without a calendar. It is tested through the reason line rather than by expecting a promotion: with no
   * calendar the pace is also unknown, and the fill rule refuses on an unknown pace by design, so a promotion is the
   * wrong thing to assert here.
   */
  const noCalendar = buildMarketBoard('river', FROM, 40, undefined, liveComp() as never, []);
  const weekend = noCalendar.nights.find((night) => night.date === '2026-11-20');
  assert.ok(weekend, 'the date is missing from the board');
  assert.doesNotMatch(
    weekend!.reason,
    /No stay can be booked on this date/,
    'a missing calendar was treated as "no night is bookable"',
  );

  // With a calendar and a short year, the same night promotes — so the guard is about the inputs, not the date.
  const withCalendar = board();
  assert.ok(
    withCalendar.nights.some((night) => night.promotionPercent === 20),
    'a calendar plus a short year should promote at least one night',
  );
});

test('the board and the shadow run agree on a closed night', () => {
  /*
   * The whole point: two surfaces, one answer. A night the shadow holds must not be a night the board promotes.
   */
  const closed = ['2026-11-20', '2026-11-21'];
  const b = board({ closed });
  for (const night of b.nights) {
    if (!closed.includes(night.date)) continue;
    assert.equal(night.promotionPercent, 0, `the board promoted ${night.date} while the shadow would hold it`);
  }
});
