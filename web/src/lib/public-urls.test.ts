/**
 * The guest booking page must be reachable without a trailing-slash dance.
 *
 * Cloudflare Pages serves the built `index.html` at an extensionless path by *normalising* it: a request
 * for `/book` answers `308 -> /`, and `/book?house=river` becomes `/?house=river` â€” the path is dropped
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
import { bookPath, housePagePath, HOUSES_PATH, rescueLegacyLink } from './public-paths.ts';
import { STAY_LINK_KEYS } from './stay-link.ts';
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
   * are exempt by design â€” `parseHousePath` and `App.tsx` compare a *received* pathname, which may
   * arrive either way and must still match â€” and so is prose in a comment.
   */
  const root = join(process.cwd(), 'src');
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entry.name) || /\.test\./.test(entry.name)) continue;
      const rel = relative(process.cwd(), full).split(sep).join('/');
      if (rel === 'src/lib/public-paths.ts') continue;
      const text = readFileSync(full, 'utf8');
      for (const line of text.split(/\r?\n/)) {
        if (/^\s*(\*|\/\/)/.test(line)) continue; // a comment is not a link
        if (/^\s*\/\*/.test(line)) continue; // a block comment, one line or many
        // `/api/book*` is a JSON endpoint, not the page that 308s. `servedPath('/book', …)` is the helper
        // that ADDS the slash — a call into it is the fix, not the bug.
        if (/\/api\/book/.test(line) || /servedPath\(/.test(line)) continue;
        if (/pathname|parseHousePath|startsWith\(|=== '\/(book|houses)/.test(line)) continue; // a received path
        // A URL handed to the browser: an href, a URL built from ORIGIN, or a template assigned to a
        // path/href field. The last form is how `quoteHref: \`/book?house=...\`` regressed.
        const href = /href="\/(book|houses)(\?|")/.exec(line);
        const built = /\$\{(ORIGIN|origin)\}\/(book|houses)(\?|`|'|"|\\n)/.exec(line);
        /*
         * A `/book` inside a template literal, followed by the query marker, the closing backtick, a quote,
         * or an escaped newline. The escaped-newline case is what the thank-you email used — `${origin}/book\n`
         * — and the first version of this rule missed it, so the guard stayed green while the link 308'd.
         */
        const rawTemplate = /\/book(\?|`|'|"|\\n)/.exec(line);
        const assigned = /(href|url|link|path|Href)\s*[:=]\s*[`'"]\/(book|houses)(\?|`|'|")/i.exec(line);
        if (href || built || rawTemplate || assigned) offenders.push(`${rel}: ${line.trim().slice(0, 100)}`);
      }
    }
  };
  walk(root);
  /*
   * `functions/` too. The first version walked only `src/`, so a link built in a Pages Function was
   * invisible to it — and that is exactly where one was hiding: the post-checkout thank-you email in
   * `functions/_lib/automation.ts` sent a past guest to `${origin}/book`, which 308s to the dashboard
   * login. Found by grepping the whole repo after this guard had been green.
   */
  walk(join(process.cwd(), 'functions'));
  assert.deepEqual(offenders, [], `these build a URL that redirects to the login:\n${offenders.join('\n')}`);
});

test('every parameter a real stay link can carry is rescued', () => {
  /*
   * The first version of this rescue had its own hand-written key list, and it was already wrong: it
   * missed `leave` and `event`, and carried an `arrival` key nothing reads. So the list is checked
   * against every key the parser actually honours, one by one — a single `house` case would have passed
   * while an arrival time still fell through to the dashboard.
   */
  for (const key of STAY_LINK_KEYS) {
    const rescued = rescueLegacyLink('/', `?${key}=x`);
    assert.ok(rescued, `a link with ${key} was not rescued`);
    assert.equal(rescued!.startsWith('/book/?'), true, `${key} rescued to ${rescued}`);
  }
});

test('a quote link mangled by the host redirect still reaches the booking page', () => {
  /*
   * `/book?house=river` answers 308 to `/?house=river`: the query survives, the path does not. Someone
   * who was emailed that link before the fix would otherwise land on a login form.
   */
  assert.equal(rescueLegacyLink('/', '?house=river'), '/book/?house=river');
  assert.equal(rescueLegacyLink('/', '?house=river&guests=8'), '/book/?house=river&guests=8');
  assert.equal(
    rescueLegacyLink('/', '?house=river&in=2026-11-13&out=2026-11-15&guests=30&children=2'),
    '/book/?house=river&in=2026-11-13&out=2026-11-15&guests=30&children=2',
  );
});

test('a plain dashboard visit is not hijacked', () => {
  /*
   * The narrow part matters more than the rescue. `/` is the dashboard, and only a booking-shaped query
   * may be redirected â€” otherwise a host opening the site with any stray parameter lands on /book.
   */
  assert.equal(rescueLegacyLink('/', ''), null);
  assert.equal(rescueLegacyLink('/', '?'), null);
  assert.equal(rescueLegacyLink('/', '?month=2026-11'), null);
  assert.equal(rescueLegacyLink('/', '?tab=guests'), null);
  assert.equal(rescueLegacyLink('/', '?utm_source=email'), null);
});

test('a real path is never rescued, because it does not need to be', () => {
  // Only the root is rewritten. A working path keeps its own routing.
  assert.equal(rescueLegacyLink('/book/', '?house=river'), null);
  assert.equal(rescueLegacyLink('/houses/', ''), null);
  assert.equal(rescueLegacyLink('/stay/abc', '?x=1'), null);
});

test('the rescued address carries the slash, so a reload still works', () => {
  const rescued = rescueLegacyLink('/', '?house=ranch');
  assert.ok(rescued);
  // The whole point: the address bar is left on a URL the host actually serves.
  assert.equal(rescued!.startsWith('/book/?'), true);
  assert.equal(/\/book\?/.test(rescued!), false);
});


