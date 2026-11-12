/**
 * Two addresses render one listing, and without a canonical they compete in search.
 *
 * `/houses/river/` and `/book/?house=river` serve the same page. The sitemap lists only the house page, but a crawler
 * that follows a shared quote link arrives at the `/book/` form, and a quote link carries `?in=&out=&guests=` — so in
 * principle every shared stay is its own URL with duplicate content.
 *
 * The fix is a canonical link plus `setMeta` that *creates* a missing tag. That second half mattered: the original
 * `setMeta` only updated a tag that already existed, so `document.querySelector` returned null and the call did
 * nothing at all — a page that looked like it set a canonical and silently did not.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { publicShare } from './house-page.ts';

const SOURCE = readFileSync(new URL('./house-page.ts', import.meta.url), 'utf8');

test('a missing meta tag is created, not silently skipped', () => {
  // The defect: `if (node) node.setAttribute(...)` with no else. A tag the document does not carry could never be set.
  const helper = /function setMeta\([\s\S]*?\n\}/.exec(SOURCE)?.[0] ?? '';
  assert.ok(helper.length > 0, 'setMeta is missing');
  assert.match(helper, /document\.createElement\('meta'\)/, 'setMeta cannot create a tag the page does not carry');
  assert.match(helper, /document\.head\.appendChild/, 'a created tag is never attached, so nothing reads it');
  assert.match(helper, /if \(existing\)/, 'setMeta no longer updates an existing tag first');
});

test('the canonical link is created when absent and updated when present', () => {
  const canonical = /function setCanonical\([\s\S]*?\n\}/.exec(SOURCE)?.[0] ?? '';
  assert.ok(canonical.length > 0, 'setCanonical is missing');
  assert.match(canonical, /link\[rel="canonical"\]/, 'the canonical link is never looked up');
  assert.match(canonical, /createElement\('link'\)/, 'a missing canonical link is never created');
  assert.match(canonical, /link\.href = href/, 'the canonical href is never set');
});

test('every public share sets a canonical that names one address', () => {
  // A house page canonicalises to its slashed house URL, which is what the sitemap and every internal link use.
  for (const house of ['river', 'ranch', 'lindon'] as const) {
    const share = publicShare(house);
    assert.ok(share.canonical, `${house} has no canonical`);
    assert.match(share.canonical!, new RegExp(`/houses/${house}/$`), `${house} canonical is not its slashed house URL`);
    // A query is not part of a page's identity; dates belong to a quote, not to the listing.
    assert.equal(share.canonical!.includes('?'), false, `${house} canonical carries a query string`);
  }
  // The index canonicalises to itself.
  assert.match(publicShare('index').canonical ?? '', /\/houses\/$/, 'the index canonical is not the houses page');
});

test('applying a share sets the canonical, and closing restores it to the dashboard', () => {
  const apply = /export function applyPublicShare[\s\S]*?\n\}/.exec(SOURCE)?.[0] ?? '';
  assert.ok(apply.length > 0, 'applyPublicShare is missing');
  assert.match(apply, /setCanonical\(share\.canonical \?\? share\.url\.split\('\?'\)\[0\]/, 'the share does not set a canonical');
  /*
   * And the restore path must point it back. Leaving a house's canonical on the dashboard would tell a crawler the
   * management board is a copy of the River House.
   */
  assert.match(apply, /setCanonical\(DASHBOARD_SHARE\.url\)/, 'the canonical is left pointing at a house after the page closes');
});
