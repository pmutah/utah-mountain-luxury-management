/**
 * A malformed token is not a permission problem.
 *
 * The middleware matches token *shapes*: an owner token must be 32 hex characters, a cleaner token 6+ characters,
 * a request token 32 hex. That is right — it keeps `/api/owner/links` (which MINTS links) behind the host gate.
 *
 * But it means a truncated or mistyped link never reaches the route that knows how to describe it. The gate answers
 * 401, and each guest page treated only 404 as "this link is not valid". So the three people who actually use these
 * links — Todd, a cleaner mid-shift, a guest waiting on an answer — were told "something went wrong" or the word
 * "Unauthorized", and the sensible next step (ask for a new link) was not offered.
 *
 * Found by probing production: `/api/owner/bogus-token` answers 401 while `/api/clean/bogus-token` answers 404, and
 * reading each page showed only the 404 reaching the "invalid" screen.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const OWNER = fs.readFileSync('src/components/OwnerPortal.tsx', 'utf8');
const CLEAN = fs.readFileSync('src/components/CleanLink.tsx', 'utf8');
const REQUEST = fs.readFileSync('src/components/RequestStatus.tsx', 'utf8');
const MIDDLEWARE = fs.readFileSync('functions/_middleware.ts', 'utf8');

test('the owner portal treats a gated token as an invalid link, not a broken statement', () => {
  assert.match(
    OWNER,
    /res\.status === 404 \|\| res\.status === 401/,
    'a malformed owner token falls through to the generic error screen',
  );
  assert.match(OWNER, /data-bot="owner-portal-invalid"/, 'there is no invalid-link screen to reach');
});

test('a cleaner with a truncated link is told the link is invalid', () => {
  // Worse than the owner case: a cleaner is standing in a house and will phone instead of retrying.
  assert.match(
    CLEAN,
    /res\.status === 404 \|\| res\.status === 401/,
    'a malformed cleaner token shows "could not be read" instead of an invalid link',
  );
  assert.match(CLEAN, /setState\('invalid'\)/, 'the cleaner page has no invalid state to set');
});

test('a guest is never shown the word "Unauthorized"', () => {
  /*
   * The request route's own messages are written for a guest and must survive: "could not be read just now" and
   * "does not name dates we can show" are different problems. Only the middleware's bare 401 is replaced.
   * The first version of this fix replaced every error with one line, which erased those.
   */
  assert.match(REQUEST, /hostWord/, 'the guest page does not tell the middleware word apart from a real message');
  assert.match(REQUEST, /unauthorized/i, 'the guest page does not recognise "Unauthorized"');
  assert.match(REQUEST, /body\?\.error/, 'the route messages are no longer used');

  // And the route's own guest messages still exist to be shown.
  const route = fs.readFileSync('functions/api/book/request/[token].ts', 'utf8');
  assert.match(route, /does not name dates we can show/, 'a guest-facing route message was removed');
});

test('the middleware is still the gate that stops the mint route', () => {
  /*
   * Loosening the shape checks to make malformed tokens reach the routes would be the wrong fix, because
   * `/api/owner/links` mints links and must stay host-only. This pins the exclusion so a later "make errors nicer"
   * change cannot open it.
   */
  assert.match(MIDDLEWARE, /\^\\\/api\\\/owner\\\/\[a-f0-9\]\{32\}\\\/\?\$/, 'the owner token shape check changed');
  assert.match(MIDDLEWARE, /links\\\/\?\$\|photos/, 'the cleaner gate no longer excludes the host routes');
});
