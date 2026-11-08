import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

/*
 * The recurring shape of this session's bugs: a caller builds a board or a digest from the **sample
 * fixtures** while the screen beside it uses real comps. It happened three times —
 *
 *   1. `portfolioDigest` on the market page rebuilt each house from `input.comps` (the fixtures).
 *   2. `shadowDayDigest` recorded every shadow day from the fixtures, so the seven-day gate that decides
 *      whether auto-pricing may act could be satisfied by a market that does not exist.
 *   3. Guarding (2) by requiring all three boards left `MarketBoard` fetching only one, so the market page
 *      silently stopped recording days at all.
 *
 * Each was found by reading a page, not the source. So this test reads the **call sites** and asserts that
 * both production paths pass real boards. It is deliberately structural: if someone adds a caller or strips
 * the boards argument, the copy and the gate go back to describing invented comps, and this fails first.
 */

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

test('the market page passes real boards to the digest', () => {
  const source = read('src/components/MarketBoard.tsx');
  const call = source.slice(source.indexOf('portfolioDigest({'));
  assert.ok(call.length > 0, 'the portfolioDigest call moved');
  const body = call.slice(0, call.indexOf('})') + 2);
  assert.match(body, /boards:\s*liveBoards/, 'the digest is not given the live boards');
});

test('the market page loads every house, not only the one in view', () => {
  /*
   * Requirement (a shadow day needs all three boards) plus a one-board fetch made this page unable to record
   * a day at all. The list must contain all three houses.
   */
  const source = read('src/components/MarketBoard.tsx');
  for (const house of ['river', 'ranch', 'lindon']) {
    assert.ok(
      source.includes(`'${house}'`),
      `${house} is missing from the market page, so a shadow day can never be recorded there`,
    );
  }
  // And the recording must require all three, or a partial day counts toward the gate.
  assert.match(source, /allBoardsLive/, 'the page does not require every board before recording');
});

test('the shadow day recorder passes real boards through', () => {
  const source = read('src/lib/shadow-day-record.ts');
  assert.match(source, /boards:\s*input\.boards/, 'the recorder drops the live boards it was given');
});

test('the brief loads boards before recording, and only when a day would be saved', () => {
  const source = read('src/components/AgentsHub.tsx');
  assert.match(source, /loadMarketOverview/, 'the brief does not load real boards');
  assert.match(source, /boards,/, 'the brief does not pass the boards it loaded');
  // Three boards cost three KV reads each, so a repeat visit on the same day must not fetch them.
  assert.match(source, /alreadySaved/, 'the brief re-reads three boards on every visit');
});

test('the saved-day clock requires the marker the recorder writes', () => {
  /*
   * The clock accepts a day only when its digest carries this exact sentence. If either side drifts, a day
   * is written and then silently not counted, or worse, counted without the check passing.
   */
  const log = read('src/lib/market/shadow-log.ts');
  assert.match(log, /Nothing sent to Hospitable\./, 'the clock no longer checks the unsent marker');
  const route = read('functions/api/pricing/shadow-days.ts');
  assert.match(route, /Nothing sent to Hospitable\./, 'the route accepts a digest it should refuse');
});
