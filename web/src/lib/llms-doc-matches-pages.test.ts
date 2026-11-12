/**
 * The bot-facing doc described a site that no longer exists.
 *
 * `llms.txt` is what an agent reads first, and its `/houses` and `/book` paragraphs described the *old* pages: a text-card
 * list, a "month calendar of nightly prices", and — actively false after the rebuild — "Ranch and Lindon do not invent a
 * bedroom count", when both publish one now.
 *
 * The existing `llms-doc.test.ts` pins route names and the auth rule, which is right, but it never checked that the prose
 * about a page matches that page. Prose drifts because nothing fails when it does, so these are targeted assertions on the
 * claims a reader would act on.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const DOC = readFileSync(new URL('../../public/llms.txt', import.meta.url), 'utf8');

/** The paragraph for one public path. */
function line(path: string): string {
  const at = DOC.indexOf(`- \`${path}\``);
  assert.ok(at >= 0, `llms.txt has no paragraph for ${path}`);
  const end = DOC.indexOf('\n- ', at + 5);
  return DOC.slice(at, end < 0 ? undefined : end);
}

test('the doc describes the photo gallery and the booking card, not a text card list', () => {
  const houses = line('/houses');
  assert.match(houses, /photo|gallery/i, 'the houses paragraph does not mention the gallery');
  assert.match(houses, /room-by-room|bed cards/i, 'the houses paragraph does not mention the room cards');
  assert.match(houses, /booking card/i, 'the houses paragraph does not mention the booking card');
  // The old shape: cards that "name the sleep count, check-in, check-out, and the photo caption" and nothing else.
  assert.equal(/Each card names the sleep count, check-in, check-out, and the photo caption/.test(houses), false, 'the doc still describes the old text-card list');
});

test('the doc no longer claims a house has no bedroom count', () => {
  /*
   * The specific falsehood. Ranch and Lindon were `null` and now publish eight and four bedrooms, so a doc telling a bot
   * that they "do not invent a bedroom count" would make it answer a guest wrongly.
   */
  assert.equal(/do not invent a bedroom count/i.test(DOC), false, 'the doc still says a house publishes no bedroom count');
  assert.match(line('/houses'), /bedroom sentence|bedroom count/i, 'the doc does not say the houses publish their layout');
});

test('the doc says /book is the same listing, and what a shared link reopens', () => {
  const book = line('/book');
  assert.match(book, /same listing/i, 'the doc still presents /book as a separate page');
  // The share keys are the contract a bot uses to build a link; each one has to be named or a bot omits it.
  for (const key of ['`in`', '`out`', '`guests`', '`children`', '`addons`', '`arrive`', '`leave`']) {
    assert.ok(book.includes(key), `the doc does not name the ${key} share key`);
  }
});

test('the doc says a held night is unavailable, and a part is offered only when priced', () => {
  // Both were live defects this session; a bot reading the doc should expect the fixed behaviour.
  assert.match(line('/book'), /held night/i, 'the doc does not mention held nights');
  assert.match(line('/houses'), /held night/i, 'the doc does not say the page treats a held night as unavailable');
  assert.match(line('/houses'), /priced/i, 'the doc does not say a part is offered only when priced');
});

test('the doc says nothing about a trial or an outbound channel', () => {
  /*
   * The owner chose direct-only. A doc still telling an agent that direct booking is "being trialled" or that a guest
   * should book on Airbnb would send people away from the site.
   */
  assert.equal(/\bbeing trialled\b|\bis a trial\b/i.test(DOC), false, 'the doc calls direct booking a trial');
  assert.equal(/book through our listing on Airbnb/i.test(DOC), false, 'the doc sends a guest to a channel');
});
