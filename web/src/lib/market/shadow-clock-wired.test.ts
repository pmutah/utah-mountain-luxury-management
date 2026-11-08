import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

/*
 * The gate a host sees was this browser's own tally, not the server's.
 *
 * `/api/pricing/shadow-days` has always returned the durable clock, and `api.getShadowDays` has always been
 * there with a comment saying "a cleared tab cannot reset the week". Nothing called it. The page set its clock
 * from `localStorage` and only asked the server **after** saving a day, so:
 *
 *   - a host on a second device read "Shadow day 0 of 7" while the server held real days;
 *   - clearing site data looked like it reset the week;
 *   - the panel printed "Saved on this browser: Nov 8" directly beneath a headline computed from the server,
 *     two sentences about two different ledgers.
 *
 * This reads the component, because the defect was a call that was never made — no unit of logic was wrong.
 */

const source = readFileSync(new URL('../../components/MarketBoard.tsx', import.meta.url), 'utf8');

test('the market page reads the durable shadow clock rather than only writing it', () => {
  assert.match(source, /api\s*\.\s*getShadowDays\(\)/, 'the page never reads the server clock on load');
  assert.match(source, /\.saveShadowDay\(/, 'the page no longer records a day');
});

test('the date list under the clock describes the same clock as the headline', () => {
  /*
   * The bug in one line: the headline used `shownClock` (server when available) while the dates beneath it
   * used `clock` (local). Two stores, one panel.
   */
  const block = /data-bot="market-shadow-dates"[\s\S]{0,1400}?<\/p>/.exec(source)?.[0] ?? '';
  assert.ok(block.length > 0, 'the date line is missing');
  assert.match(block, /shownClock\.dates/, 'the date list reads a different clock from the headline');
  assert.equal(/[^n]clock\.dates/.test(block), false, 'the date list still reads the local clock');
});

test('a server clock is never presented as zero days when the read fails', () => {
  /*
   * If the server could not be read, the local clock stays — but the label must not then claim the server
   * says nothing. Both branches exist so "No shadow day is saved on the server yet" is only reachable when
   * the server actually answered.
   */
  assert.match(source, /No shadow day is saved on the server yet/);
  assert.match(source, /No shadow day is saved on this browser yet/);
  const catchBlock = /getShadowDays\(\)[\s\S]{0,700}?catch\(/.exec(source)?.[0] ?? '';
  assert.ok(catchBlock.length > 0, 'the durable read has no failure path');
  assert.equal(
    /setServerClock/.test(catchBlock.replace(/\.then\([\s\S]*?\)\s*\./, '')),
    false,
    'a failed read must not set a server clock',
  );
});
