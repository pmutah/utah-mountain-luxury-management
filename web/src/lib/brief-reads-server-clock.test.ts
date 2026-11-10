/**
 * The daily brief shows the server's shadow count, not this browser's.
 *
 * The seven-day shadow clock gates the rate push. The market board has read the durable count since it was fixed — its comment says
 * a second device showed "0 of 7" while the server held real days. The **brief** never did.
 *
 * `AgentsHub` computed the count as `shadowSaved ?? shadowClock(loadShadowLog(), today).days`. `shadowSaved` is only set after
 * this tab records a day, and the fallback is browser storage — so the page a host opens daily reported a number that a cleared
 * tab or a second device could reset to zero, while the server held the real week.
 *
 * The same mistake cost reads too: the decision to fetch nine KV reads' worth of boards was made from the local log, so on a
 * fresh browser it fetched them on every visit even when the server already held today.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const HUB = readFileSync('src/components/AgentsHub.tsx', 'utf8');

test('the brief reads the durable clock', () => {
  assert.match(HUB, /api\s*\.getShadowDays\(\)/, 'the brief never asks the server for the shadow clock');
  // The count it shows prefers the server, then a day saved from this tab, then local storage as a last resort.
  assert.match(
    HUB,
    /shadowDays: shadowSaved \?\? serverShadow\?\.days \?\? shadowClock\(/,
    'the brief does not prefer the server count over browser storage',
  );
});

test('a failed read does not become zero days', () => {
  /*
   * The brief's line says "Shadow day N of 7". An unread clock shown as 0 would tell a host the week had not started when it might
   * be six days in — the same defect the market board's comment describes.
   */
  const idx = HUB.indexOf('getShadowDays()');
  assert.ok(idx > 0);
  const around = HUB.slice(idx, idx + 500);
  assert.match(around, /\.catch\(/, 'a failed clock read is not caught');
  assert.equal(/setServerShadow\(\{ days: 0/.test(HUB), false, 'a failed read is stored as zero days');
});

test('whether today is saved is decided by the date, not by the read succeeding', () => {
  /*
   * My first version treated a successful server read as "today is already saved", which would have skipped saving today
   * whenever the server held any days at all. The dates are what answer it.
   */
  assert.match(HUB, /serverShadow\?\.dates\.includes\(today\)/, 'the save decision does not check whether today is on the server');
  assert.equal(
    /serverShadowDays !== null/.test(HUB),
    false,
    'a successful read is being treated as "today is saved", which skips a real save',
  );
});

test('the save decision also honours a day this tab already recorded', () => {
  // Two sources, either of which means there is nothing to save.
  assert.match(HUB, /const localSaved = loadShadowLog\(\)\.some/, 'the local log is no longer checked');
  assert.match(HUB, /const alreadySaved = localSaved \|\|/, 'the two sources are not combined');
});

test('the market board and the brief use the same source', () => {
  // Two pages disagreeing about the same week is how a host learns not to trust either number.
  const board = readFileSync('src/components/MarketBoard.tsx', 'utf8');
  assert.match(board, /api\s*\.getShadowDays\(\)/, 'the board stopped reading the durable clock');
  assert.match(board, /result\.clock/, 'the board does not use the server clock it reads');
});
