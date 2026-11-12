/**
 * A token-addressed page must never be indexed.
 *
 * A stay link, a cleaner link, an owner statement, a request status page, and an e-sign ceremony all carry the credential
 * in the path — anyone holding the URL is in. Nothing in the app sent `X-Robots-Tag` and `robots.txt` did not mention
 * any of these paths, so a single shared link posted in a group chat could be crawled, indexed, and then surfaced in
 * search results: a guest's name and dates, a door code, or an owner's share.
 *
 * `robots.txt` alone is not the fix. It is advisory, crawlers may ignore it, and it cannot un-index a URL that is
 * already linked from elsewhere. The header is the enforcement; this file checks both, and checks that the public pages
 * were not caught by the same pattern.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const MIDDLEWARE = readFileSync(new URL('../../functions/_middleware.ts', import.meta.url), 'utf8');
const ROBOTS = readFileSync(new URL('../../public/robots.txt', import.meta.url), 'utf8');

/** The private-page matcher, pulled from the source so this test exercises the real patterns. */
function privateMatcher(): (path: string) => boolean {
  const block = /const PRIVATE_PAGES = \[([\s\S]*?)\];/.exec(MIDDLEWARE)?.[1] ?? '';
  assert.ok(block.trim().length > 0, 'the middleware has no private-page list');
  const patterns = [...block.matchAll(/\/((?:\\.|[^/\\])+)\/([a-z]*)/g)].map((m) => new RegExp(m[1]!, m[2] ?? ''));
  assert.ok(patterns.length >= 5, `only ${patterns.length} private-page patterns were found`);
  return (path: string) => patterns.some((pattern) => pattern.test(path));
}

test('every token-addressed page is marked noindex in the response', () => {
  /*
   * The pattern list, exercised against real URLs the app mints. These are shaped exactly like the ones in the wild:
   * `/stay/<token>`, `/clean/<token>`, `/owner/<token>`, `/request/<token>`, `/esign/<token>`.
   */
  const isPrivate = privateMatcher();
  for (const path of [
    '/stay/abc123def456',
    '/stay/abc123def456/preferences',
    '/clean/0123456789abcdef0123456789abcdef',
    '/owner/0123456789abcdef0123456789abcdef',
    '/request/0123456789abcdef0123456789abcdef',
    '/esign/abc123def456',
  ]) {
    assert.equal(isPrivate(path), true, `${path} is not treated as private, so it can be indexed`);
  }
});

test('the public pages are not caught by the private pattern', () => {
  // The opposite failure: a noindex header on the booking site would remove it from search entirely.
  const isPrivate = privateMatcher();
  for (const path of ['/', '/houses/', '/houses/river/', '/book/', '/terms', '/privacy', '/accessibility', '/llms.txt']) {
    assert.equal(isPrivate(path), false, `${path} would be served noindex, hiding the public site from search`);
  }
});

test('the header itself is sent, and the non-API branch is where it is applied', () => {
  /*
   * The pages are static HTML served by Pages, so the middleware is the only place that can attach a header to them.
   * The non-API branch is the one every page request takes.
   */
  assert.match(MIDDLEWARE, /X-Robots-Tag/, 'nothing sends an X-Robots-Tag header');
  assert.match(MIDDLEWARE, /noindex/, 'the header does not say noindex');
  assert.match(MIDDLEWARE, /noarchive/, 'a cached copy of a guest stay could outlive the token');
  assert.match(
    MIDDLEWARE,
    /if \(!url\.pathname\.startsWith\('\/api\/'\)\) return withSecurity\(await context\.next\(\), isPrivatePage\(url\.pathname\)\)/,
    'the private flag is not passed on the page branch, so the header is never set',
  );
});

test('robots.txt names the private paths as well', () => {
  /*
   * Advisory, and kept because a well-behaved crawler should not even ask for these. The header is what holds; this is
   * the courtesy, and it costs nothing.
   */
  for (const path of ['/stay/', '/clean/', '/owner/', '/request/', '/esign/']) {
    assert.match(ROBOTS, new RegExp(`^Disallow: ${path.replace(/\//g, '\\/')}$`, 'm'), `robots.txt does not disallow ${path}`);
  }
  // And the public pages stay allowed, or the site drops out of search.
  for (const path of ['/houses/', '/book/']) {
    assert.match(ROBOTS, new RegExp(`^Allow: ${path.replace(/\//g, '\\/')}$`, 'm'), `robots.txt no longer allows ${path}`);
  }
});
