import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

/*
 * The sitemap advertised `/houses` and `/book` without the trailing slash. Both answer **301** to their slashed form,
 * so two of five entries were redirects — a crawler spends a hop on each and a search engine treats them as non-canonical.
 *
 * The redirects themselves are correct and deliberate (an extensionless path with no file behind it normalises to a
 * directory). What was wrong is advertising the redirecting form. Verified against a running server: after the fix all
 * five sitemap URLs answer 200 with no redirect.
 *
 * This guard cannot make HTTP calls — it reads the files — so it checks the two things that caused the bug: the sitemap
 * must use the slashed forms, and the redirects file must keep redirecting them, so the pair cannot silently disagree.
 */

const SITEMAP = readFileSync(new URL('../../public/sitemap.xml', import.meta.url), 'utf8');
const ROBOTS = readFileSync(new URL('../../public/robots.txt', import.meta.url), 'utf8');
const REDIRECTS = readFileSync(new URL('../../public/_redirects', import.meta.url), 'utf8');

const LOCS = [...SITEMAP.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);

test('the sitemap has entries at all', () => {
  assert.ok(LOCS.length >= 5, `the sitemap lists only ${LOCS.length} URLs`);
});

test('no sitemap URL is one the redirects file would redirect', () => {
  /*
   * Read the redirect rules and check the sitemap against them, rather than hard-coding the two paths. Adding a redirect
   * for a URL the sitemap already lists is the same bug in a new place.
   */
  const redirected = REDIRECTS.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => line.split(/\s+/))
    .filter(([, , status]) => status === '301' || status === '302' || status === '308')
    .map(([from]) => from!);

  for (const loc of LOCS) {
    const path = new URL(loc).pathname;
    assert.equal(
      redirected.includes(path),
      false,
      `the sitemap lists ${path}, which the redirects file sends elsewhere`,
    );
  }
});

test('the public paths in the sitemap carry the slash the app serves', () => {
  const paths = LOCS.map((loc) => new URL(loc).pathname);
  assert.ok(paths.includes('/book/'), 'the booking page is missing or unslashed');
  assert.ok(paths.includes('/houses/'), 'the houses index is missing or unslashed');
  /*
   * The three house pages were listed without the slash while the app links them with one, so the sitemap advertised an
   * address no internal link uses. This checks every `/houses/<id>` entry, not just the index — the earlier version of
   * this test looked only at `/houses/` and `/book/`, which is why the three unslashed entries survived.
   */
  for (const house of ['river', 'ranch', 'lindon']) {
    assert.ok(paths.includes(`/houses/${house}/`), `${house} is missing from the sitemap, or listed without the slash`);
    assert.equal(
      paths.includes(`/houses/${house}`),
      false,
      `${house} is listed unslashed, an address the app does not link`,
    );
  }
});

test('robots points crawlers at the sitemap', () => {
  // Without this line a crawler only finds the sitemap by guessing.
  assert.match(ROBOTS, /^Sitemap: https:\/\/wilhite-portfolio\.pages\.dev\/sitemap\.xml$/m, 'robots.txt does not name the sitemap');
});

test('robots allows the public pages and keeps /api/ out', () => {
  assert.match(ROBOTS, /^Allow: \/houses\/$/m, 'robots does not allow the houses index');
  assert.match(ROBOTS, /^Allow: \/book\/$/m, 'robots does not allow the booking page');
  assert.match(ROBOTS, /^Disallow: \/api\/$/m, 'robots does not keep crawlers out of the API');
});
