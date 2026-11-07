/**
 * The shadow week gates the entire rate push: nothing can be sent until seven Denver days are saved,
 * and a write token cannot unlock it early.
 *
 * That gate was effectively permanent. A day was only saved by the market page, so the clock advanced
 * only for a host who happened to open `#/market`. The nightly brief â€” the page a host actually reads
 * daily â€” showed "Shadow day 1 of 7" and never said how to move it, and reading the brief did not
 * count. A host following the brief would sit at day one forever and never learn why the push stayed
 * closed.
 *
 * These tests pin the two halves of the fix: the brief records a day, and a day is only recorded when
 * the calendar was actually read.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { shadowDayDigest, withToday } from './shadow-day-record.ts';
import { SHADOW_DAYS_REQUIRED, shadowClock } from './market/shadow-log.ts';
import { agentBrief } from './agent-brief.ts';

const BASE = {
  taken: { river: [], ranch: [], lindon: [] },
  closed: { river: [], ranch: [], lindon: [] },
  paused: { river: false, ranch: false, lindon: false },
  stays: [],
  paceLive: true,
  preferenceTimes: null,
  compChoices: {
    river: { pinned: [], excluded: [] },
    ranch: { pinned: [], excluded: [] },
    lindon: { pinned: [], excluded: [] },
  },
};

test('a day with the calendar read is a usable shadow day', () => {
  const record = shadowDayDigest({ ...BASE, asOf: '2026-11-07', calendarLive: true });
  assert.equal(record.state, 'ready');
  // The route refuses a digest without this line, so producing one that fails its own guard would
  // mean the save silently 400s.
  assert.ok(
    record.digest.includes('Nothing sent to Hospitable.'),
    'the digest does not carry the line the route requires',
  );
});

test('a day whose calendar could not be read is not recorded', () => {
  /*
   * `shadowClockFromSaved` drops an unread day anyway, so saving one would tell the host a day was
   * banked when it was not. It has to be refused before the save, not filtered after.
   */
  const record = shadowDayDigest({ ...BASE, asOf: '2026-11-07', calendarLive: false });
  assert.equal(record.state, 'unread');
  assert.equal(record.digest, '');
  const log = [{ date: '2026-11-06', digest: shadowDayDigest({ ...BASE, asOf: '2026-11-06', calendarLive: true }).digest }];
  assert.equal(withToday(log, '2026-11-07', record.digest).length, 1, 'an unread day was added to the log');
});

test('a week of days from the brief reaches the push gate', () => {
  let log: Array<{ date: string; digest: string }> = [];
  const start = Date.UTC(2026, 10, 7);
  for (let i = 0; i < SHADOW_DAYS_REQUIRED; i += 1) {
    const date = new Date(start + i * 86_400_000).toISOString().slice(0, 10);
    log = withToday(log, date, shadowDayDigest({ ...BASE, asOf: date, calendarLive: true }).digest);
  }
  const clock = shadowClock(log, '2026-11-14');
  assert.equal(clock.days, SHADOW_DAYS_REQUIRED);
  assert.equal(clock.ready, true, 'seven saved days did not open the gate');
  // The same day twice is still one day, so a reload cannot finish the week early.
  const twice = withToday(log, '2026-11-13', shadowDayDigest({ ...BASE, asOf: '2026-11-13', calendarLive: true }).digest);
  assert.equal(shadowClock(twice, '2026-11-14').days, SHADOW_DAYS_REQUIRED);
});

test('the brief says how to advance the shadow week, not just where it is', () => {
  /*
   * "Shadow day 1 of 7" with no instruction is how the gate stayed shut. A host has to be told that
   * the day is saved by opening the page, and that reading the brief alone is not enough.
   *
   * These assertions read the shadow line only. Searching the whole brief made the first version of
   * this test pass for the wrong reason: another line mentions the market page, so the check found a
   * match that had nothing to do with the shadow week.
   */
  const shadowLine = (days: number): string => {
    const line = agentBrief({ asOf: '2026-11-07', stays: [], shadowDays: days, openJobs: 0, calendarReady: true }).find(
      (entry) => /shadow day/i.test(entry.text),
    );
    assert.ok(line, `no shadow line in the brief for ${days} days`);
    return line.text;
  };

  const empty = shadowLine(0);
  assert.match(empty, /Open the market page once today/i, 'the brief does not say how to save the first day');
  assert.ok(
    empty.includes(`${SHADOW_DAYS_REQUIRED} are needed`),
    'the brief does not say how many days the week takes',
  );
  assert.match(empty, /Hospitable write closed/, 'the brief stopped saying the write is closed');

  const partial = shadowLine(3);
  assert.match(partial, /4 more days/i, 'the brief does not say how many days are left');
  assert.match(partial, /Reading this brief does not count/i, 'the brief implies reading it advances the clock');

  const ready = shadowLine(SHADOW_DAYS_REQUIRED);
  assert.match(ready, /write token/i, 'the finished week does not say what still blocks a send');
  assert.equal(/open the market page|more days/i.test(ready), false, 'a finished week still asks for more days');
});

test('the brief and the market page build the digest the same way', () => {
  /*
   * Two surfaces saving the same day is only safe if they agree on what a day is. Both call this one
   * function, so the digest for a given input is identical â€” a copy per component is how these drift.
   */
  const a = shadowDayDigest({ ...BASE, asOf: '2026-11-07', calendarLive: true });
  const b = shadowDayDigest({ ...BASE, asOf: '2026-11-07', calendarLive: true });
  assert.equal(a.digest, b.digest);
});


test('recording a shadow day does not fetch reservations a second time', () => {
  /*
   * The brief already holds the reservations. Reading them again on the same page load is the exact
   * duplication that exhausted the daily KV limit on 2026-11-07, and that outage is why every ledger
   * route was refusing. The helper reads the calendar only; the stays come from the caller.
   */
  const helper = readFileSync(join(process.cwd(), 'src', 'lib', 'shadow-day-record.ts'), 'utf8');
  const code = helper.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.equal(
    /loadPaceStays/.test(code),
    false,
    'the shadow-day helper fetches reservations itself instead of taking them from the caller',
  );
  assert.match(code, /loadQuoteCalendar/, 'the helper no longer reads the calendar');

  // And the brief passes what it already has rather than letting the helper go and get it.
  const hub = readFileSync(join(process.cwd(), 'src', 'components', 'AgentsHub.tsx'), 'utf8');
  assert.match(hub, /stays: reservations/, 'the brief does not pass its own reservations to the digest');
});

