import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { agentBrief } from './agent-brief.ts';
import { recordShadowDay, shadowClock } from './market/shadow-log.ts';

/*
 * On 2026-11-08 the shadow week looked stuck at zero while the server actually held the day.
 * `GET /api/pricing/shadow-days` returned `days: 1, dates: ['2026-11-08']`, and local storage held the
 * same date — but the agents brief still said "Shadow day 0 of 7".
 *
 * Two causes, both fixed here:
 *
 *   1. The brief reads `shadowSaved`, and that value was missing from the `useMemo` dependency list, so
 *      recording a day never recomputed the text. A host reading "0 of 7" concludes the day did not
 *      save and stops opening the page — which is how a seven-day gate stays closed forever.
 *   2. The copy told the host "Reading this brief does not count", while the brief is in fact one of
 *      the two surfaces that saves a day. The instruction sent people to the market page for something
 *      the page they were already on had done.
 */

const DIGEST = 'Shadow run. 3 saved comps. Nothing sent to Hospitable. All three houses read.';

const BASE = {
  asOf: '2026-11-08',
  stays: [],
  openJobs: 0,
  calendarReady: true,
  booksPaused: false,
  fixes: [],
  houseFixes: [],
  closed: [],
  blocksReady: true,
  arrivalWindows: null,
  departureWindows: null,
} as const;

/** The brief is a list of lines, so the assertions read it the way the page does. */
function text(days: number): string {
  return agentBrief({ ...BASE, shadowDays: days } as never)
    .map((line) => line.text)
    .join('\n');
}

test('the brief states the shadow day it is given', () => {
  assert.match(text(0), /Shadow day 0 of 7/);
  assert.match(text(1), /Shadow day 1 of 7/);
  assert.match(text(3), /Shadow day 3 of 7/);
  assert.match(text(7), /Shadow days 7 of 7 are saved/);
  // The number has to come from the argument, not from a constant in the copy.
  assert.notEqual(text(0), text(1));
});

test('recording a day moves the clock the brief is given', () => {
  const empty = shadowClock([], '2026-11-08');
  assert.equal(empty.days, 0);

  const log = recordShadowDay([], '2026-11-08', DIGEST);
  assert.equal(shadowClock(log, '2026-11-08').days, 1, 'recording a day did not advance the clock');

  let week = log;
  for (const date of ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14']) {
    week = recordShadowDay(week, date, DIGEST);
  }
  const done = shadowClock(week, '2026-11-14');
  assert.equal(done.days, 7);
  assert.equal(done.ready, true, 'seven saved days did not open the gate');
});

test('the brief recomputes when the recorded day changes', () => {
  /*
   * The defect was a missing entry in the memo's dependency list, which no behavioural test at this
   * level can observe. The guard is therefore on the source: a brief built from a value that is not a
   * dependency is a brief that can go stale, and this one did.
   */
  const source = readFileSync(join(process.cwd(), 'src', 'components', 'AgentsHub.tsx'), 'utf8');
  assert.match(source, /shadowSaved \?\?/, 'the brief no longer reads the recorded day count');
  assert.match(
    source,
    /rateCalendar, shadowSaved\]/,
    'shadowSaved is read by the brief but missing from its dependency list, so the count goes stale',
  );
});

test('the zero-day copy does not claim the brief is ignored, because the brief saves the day', () => {
  /*
   * The brief is one of the two surfaces that records a day (`AgentsHub` posts
   * `/api/pricing/shadow-days`). Telling the host "Reading this brief does not count" while it counts
   * is the instruction that kept the week at zero: the day saved, the number did not move, and the
   * text said to go somewhere else and do it again.
   */
  const zero = text(0);
  assert.doesNotMatch(
    zero,
    /Reading this brief does not count/i,
    'the copy says the brief does not count, but opening it is what records the day',
  );
  assert.match(zero, /market page/i, 'the host still needs the pointer to the other surface');
});
