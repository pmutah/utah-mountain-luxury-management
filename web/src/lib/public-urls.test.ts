/**
 * The guest booking page must be reachable without a trailing-slash dance.
 *
 * Cloudflare Pages serves the built `index.html` at an extensionless path by *normalising* it: a request
 * for `/book` answers `308 -> /`, and `/book?house=river` becomes `/?house=river` — the path is dropped
 * and the guest lands on the dashboard login. `/book/` serves the app correctly.
 *
 * The app linked to `/book?...` everywhere, so **every "Book now" and "Quote" link landed on a login
 * screen** for anyone who was not signed in. This survived because the tests pinned `/book?...` as the
 * expected value: they were green while the product was broken. That is the failure this file guards,
 * so it checks the shape of the URL rather than trusting the old expectation.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import test from 'node:test';
import { bookPath, housePagePath, HOUSES_PATH } from './public-paths.ts';
import { bookShare, GROUP_TRIP_HREF, houseQuoteHref, parseHousePath } from './house-page.ts';

test('the public path helpers produce the form the host serves', () => {
  // The slash goes before the query: `/book/?a=1` serves, `/book?a=1` redirects to the login.
  assert.equal(bookPath(), '/book/');
  assert.equal(bookPath('house=ranch'), '/book/?house=ranch');
  assert.equal(bookPath('?house=ranch'), '/book/?house=ranch');
  assert.equal(HOUSES_PATH, '/houses/');
  assert.equal(housePagePath('river'), '/houses/river/');
});

test('every booking link the app builds carries the slash', () => {
  /*
   * These are the builders that reach a guest: a share link, a group trip, a house page quote, and the
   * share URL that goes out in an email. Each one 308'd before.
   */
  assert.equal(GROUP_TRIP_HREF.startsWith('/book/?'), true, `group trip href is ${GROUP_TRIP_HREF}`);
  assert.equal(houseQuoteHref('ranch', '', ''), '/book/?house=ranch');
  assert.equal(houseQuoteHref('ranch', '2026-11-13', '2026-11-15'), '/book/?house=ranch&in=2026-11-13&out=2026-11-15');
  const shared = bookShare('ranch', { guests: '4' });
  assert.match(shared.url, /\/book\/\?house=ranch/, `share url is ${shared.url}`);
  assert.equal(/\/book\?/.test(shared.url), false, 'the share url uses the redirecting form');
});

test('a house page still parses from either path form', () => {
  // Links already sent out use both, and a 308 does not fix them for a recipient.
  for (const path of ['/houses', '/houses/', '/houses/river', '/houses/river/']) {
    assert.notEqual(parseHousePath(path), null, `${path} does not parse`);
  }
  assert.equal(parseHousePath('/houses'), 'index');
  assert.equal(parseHousePath('/houses/'), 'index');
  assert.equal(parseHousePath('/houses/river/'), 'river');
});

test('no source file links to /book or /houses without the slash', () => {
  /*
   * The broad check, because a new link added by hand is exactly how this regressed.
   *
   * It looks for the places a URL is *handed to a browser*: an `href` or a share URL. Router comparisons
   * are exempt by design — `parseHousePath` and `App.tsx` compare a *received* pathname, which may
   * arrive either way and must still match — and so is prose in a comment.
   */
  const root = join(process.cwd(), 'src');
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules') continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entry.name) || /\.test\./.test(entry.name)) continue;
      const rel = relative(root, full).split(sep).join('/');
      if (rel === 'lib/public-paths.ts') continue;
      const text = readFileSync(full, 'utf8');
      for (const line of text.split(/\r?\n/)) {
        if (/^\s*(\*|\/\/)/.test(line)) continue; // a comment is not a link
        if (/pathname|parseHousePath|startsWith\(|=== '\/(book|houses)/.test(line)) continue; // a received path
        // A URL handed to the browser: an href, a URL built from ORIGIN, or a template assigned to a
        // path/href field. The last form is how `quoteHref: \`/book?house=...\`` regressed.
        const href = /href="\/(book|houses)(\?|")/.exec(line);
        const built = /\$\{ORIGIN\}\/(book|houses)(\?|`|'|")/.exec(line);
        const assigned = /(href|url|link|path|Href)\s*[:=]\s*[`'"]\/(book|houses)(\?|`|'|")/i.exec(line);
        if (href || built || assigned) offenders.push(`${rel}: ${line.trim().slice(0, 90)}`);
      }
    }
  };
  walk(root);
  assert.deepEqual(offenders, [], `these build a URL that redirects to the login:\n${offenders.join('\n')}`);
});
