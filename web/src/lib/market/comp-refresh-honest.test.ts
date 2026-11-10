import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/*
 * The automatic comp-price read, measured on production 2026-11-10.
 *
 * `POST /api/pricing/refresh` answered `refreshed: 2` with **seventeen** comps each reported as
 * "could not extract price - use manual snapshot". That sentence is the defect, not the missing prices: it sends the host
 * to redo work by hand for a failure the code caused.
 *
 * Two facts, both checked against the live pages rather than assumed:
 *
 *   1. **The HTML was truncated to 12,000 characters.** An Airbnb listing page is ~1.03 MB and its `$` figures begin
 *      around character 942,781; a Vrbo page is ~2.1 MB. The extractor was shown the `<head>` and nothing else, so it
 *      could never have found a price.
 *   2. **The listing's own rate is not in the static HTML.** On Vrbo 2453705 the only `priceRange` values belong to
 *      *nearby* listings in structured data - reading one would write a stranger's rate onto our comp.
 *
 * These guards pin the corrections, because every one of them is a regression that would look like "the site stopped
 * working" rather than like a code change.
 */

const STORE = readFileSync(join(process.cwd(), 'functions', '_lib', 'pricing-store.ts'), 'utf8');
const start = STORE.indexOf('export async function refreshCompPrices');
assert.ok(start > 0, 'refreshCompPrices is not in pricing-store');
const FN = STORE.slice(start);

test('the whole page is read, not its first 12,000 characters', () => {
  /*
   * This was the actual bug. The price on a live listing appears hundreds of thousands of characters in, so a truncated
   * body guarantees a null no matter how good the model is.
   */
  assert.equal(
    /\.slice\(\s*0\s*,\s*12\s*_?000\s*\)/.test(FN),
    false,
    'the page body is truncated again, so a real price cannot be found',
  );
  assert.match(FN, /const html = await res\.text\(\);/, 'the page body is not read whole');
});

test('a nearby listing\'s price is refused, because it is not our comp', () => {
  /*
   * The one place a `$` figure does appear in a Vrbo document is the `priceRange` of a *neighbour*. Writing that onto our
   * comp would move our band using a stranger's rate, which is worse than having no comp price.
   *
   * Scoped to the prompt string itself. A first version searched the whole function and passed while the exclusion was
   * deleted, because the word "nearby" survived in a comment above it - the same false-positive shape as the dead-branch
   * guards elsewhere.
   */
  const promptStart = FN.indexOf('text:\n');
  const promptEnd = FN.indexOf('`Return ONLY JSON');
  assert.ok(promptStart > 0 && promptEnd > promptStart, 'the extractor prompt could not be located');
  const PROMPT = FN.slice(promptStart, promptEnd);
  assert.match(PROMPT, /this listing only/i, 'the prompt does not restrict the rate to this listing');
  assert.match(PROMPT, /"nearby"/, 'the prompt does not exclude nearby listings');
  assert.match(PROMPT, /structured data/i, 'the prompt does not exclude other listings\' structured data');
  assert.match(PROMPT, /return null/i, 'the prompt does not say to return null when the rate is absent');
});

test('a null rate is explained as the channel, not blamed on the host', () => {
  assert.equal(
    /could not extract price/i.test(FN),
    false,
    'the copy blames the host again instead of naming the channel',
  );
  assert.match(
    FN,
    /does not publish its nightly rate in the page itself/i,
    'a null result is not explained as the site not publishing the rate',
  );
  // The next step has to be the one that works: read it in a browser.
  assert.match(FN, /in a browser/i, 'a null result gives no workable next step');
});

test('a blocked fetch names the block rather than reporting an empty success', () => {
  assert.match(FN, /res\.status === 403/, 'a 403 is not called out as a block');
  assert.match(FN, /blocks a server-side read/i, 'a 403 is not explained');
});

test('no extractor configured is its own answer, not 19 broken comps', () => {
  /*
   * Without a key the old code fell through every comp and pushed 19 errors, which reads as nineteen bad comps. The host
   * cannot fix that by editing a comp, so it is reported as one fact about the deployment.
   */
  assert.match(FN, /if \(!geminiKey\)/, 'a missing key is not checked before the loop');
  assert.match(FN, /noKey: true/, 'a missing key is not reported as its own state');
  assert.match(FN, /No price extractor is configured/i, 'a missing key has no line of its own');
});

test('the outcome counts what happened, including comps skipped as recent', () => {
  assert.match(FN, /recent\+\+/, 'a comp skipped for a recent rate is not counted');
  // The field is declared on `CompRefreshOutcome`, above the function, so read the whole module for it.
  assert.match(STORE, /recent: number/, 'the outcome has no field for recently-read comps');
  assert.match(STORE, /line: string/, 'the outcome has no host-facing line');
  // A zero read has to say zero rather than render as silence.
  assert.match(FN, /refreshed === 0/, 'a zero-refresh run has no wording of its own');
});

test('both callers pass the richer outcome through', () => {
  const route = readFileSync(join(process.cwd(), 'functions', 'api', 'pricing', 'refresh.ts'), 'utf8');
  assert.match(route, /\.\.\.result/, 'the refresh route drops the new outcome fields');
  const tool = readFileSync(join(process.cwd(), 'functions', '_lib', 'agent', 'execute-tool.ts'), 'utf8');
  assert.match(tool, /return result;/, 'the agent tool drops the new outcome fields');
});
