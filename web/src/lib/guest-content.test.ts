/**
 * The guest-facing content: reviews, the FAQ, and the cancellation line.
 *
 * The rule this file protects is that none of it is invented. A fabricated review is a lie told to someone about to pay a deposit,
 * and an invented cancellation window is a promise the owner never made.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  APPROVED_REVIEWS,
  CANCELLATION_ANSWER,
  CANCELLATION_LINE,
  houseFaq,
  reviewSummary,
  reviewsFor,
} from './guest-content.ts';
import { houseGallery, hasGallery } from './house-photos.ts';
import { publicShare } from './house-page.ts';

const root = join(process.cwd());

test('no review is invented, and an empty list renders nothing', () => {
  /*
   * The list is empty until the owner supplies a real one. The block is required to render nothing at all in that state rather than
   * a placeholder — "be the first to review" on a page selling a stay is worse than silence, because it invites the guest to
   * wonder what is being withheld.
   */
  assert.deepEqual(APPROVED_REVIEWS, [], 'a review was added without the owner supplying one');
  for (const house of ['ranch', 'lindon', 'river'] as const) {
    assert.deepEqual(reviewsFor(house), []);
  }
  assert.equal(reviewSummary([]), '');

  const block = readFileSync(join(root, 'src/components/HouseSocialProof.tsx'), 'utf8');
  assert.match(block, /if \(reviews\.length === 0\) return null/, 'an empty review list renders something');
});

test('a review summary counts only what is there', () => {
  const summary = reviewSummary([
    { who: 'A B', house: 'ranch', when: 'August 2026', rating: 5, text: 'Great.', source: 'Airbnb' },
    { who: 'C D', house: 'ranch', when: 'July 2026', rating: 4, text: 'Good.', source: 'Direct' },
    { who: 'E F', house: 'ranch', when: 'June 2026', text: 'Fine.', source: 'VRBO' },
  ]);
  assert.equal(summary, '4.5 from 3 guest reviews');
  // One review is singular, and a rating-less set reports a count without inventing an average.
  assert.equal(
    reviewSummary([{ who: 'A B', house: 'ranch', when: 'May 2026', text: 'Nice.', source: 'Google' }]),
    '1 guest review',
  );
});

test('the FAQ is built from this house, never from a template', () => {
  const river = houseFaq('river');
  const lindon = houseFaq('lindon');
  assert.ok(river.length >= 4);
  // Times come from the published stay facts, and the two houses differ, so the answers cannot be a shared string.
  const riverTimes = river.find((row) => /check-in and check-out/i.test(row.question));
  const lindonTimes = lindon.find((row) => /check-in and check-out/i.test(row.question));
  assert.ok(riverTimes && lindonTimes);
  assert.notEqual(riverTimes!.answer, lindonTimes!.answer, 'both houses got the same check-in answer');
  // Every answer has content, and no answer carries a secret or a price.
  for (const row of [...river, ...lindon]) {
    assert.ok(row.answer.trim().length > 20, `a thin answer: ${row.question}`);
    assert.doesNotMatch(row.answer, /\$\d/, `an answer quotes a price: ${row.question}`);
    assert.doesNotMatch(row.answer, /door\s*code|wi-?fi|password/i, `an answer leaks access: ${row.question}`);
  }
});

test('the cancellation terms are the owner rule, not an invented window', () => {
  /*
   * No refund window is stated, because the owner has not set one. What the page does say is true and checkable: the terms are
   * confirmed in writing before anything is due.
   */
  assert.match(CANCELLATION_ANSWER, /confirmed in writing with your booking/);
  assert.doesNotMatch(CANCELLATION_ANSWER, /\b\d+\s*(day|days|hour|hours|week|weeks)\b/, 'an invented cancellation window');
  assert.doesNotMatch(CANCELLATION_ANSWER, /non-?refundable/i, 'a refund policy nobody set');
  assert.match(CANCELLATION_LINE, /^Cancellation: /);

  const book = readFileSync(join(root, 'src/components/DirectReserveCard.tsx'), 'utf8');
  assert.match(book, /CANCELLATION_LINE/, 'the booking page does not show the cancellation line');
});

test('the booking page and the house page both carry the FAQ', () => {
  const book = readFileSync(join(root, 'src/components/DirectReserveCard.tsx'), 'utf8');
  // The listing page moved into its own component when the house page became a visual listing.
  const house = readFileSync(join(root, 'src/components/HouseListing.tsx'), 'utf8');
  assert.match(book, /stay-faq/, 'the booking page has no FAQ');
  assert.match(house, /HouseReviews/, 'the house page has no reviews block');
  assert.match(house, /HouseFaq/, 'the house page has no FAQ');
  // A disclosure element rather than a scripted accordion: it works with no JavaScript.
  const block = readFileSync(join(root, 'src/components/HouseSocialProof.tsx'), 'utf8');
  assert.match(block, /<details/);
  assert.match(block, /<summary/);
});

test('a house now shows its real photo set, with the rendering label intact', () => {
  /*
   * The page shipped one photo per house while the live listings carried dozens, so a direct booking page read as
   * thinner than the same house on Airbnb. The gallery now holds the harvested listing set; what must not change is
   * that the River House's pictures are labeled as renderings, because the house is not photographed yet.
   */
  for (const house of ['ranch', 'lindon', 'river'] as const) {
    const photos = houseGallery(house);
    assert.ok(photos.length > 1, `${house} still has only the cover photo`);
    assert.equal(hasGallery(house), true, `${house} is not treated as a gallery`);
    /*
     * The share image is still in the set, but it no longer leads: opening on a file captioned "Listing photo" wasted
     * the most valuable slot on the page. The cover is kept for the shared link and for a house with no photographs.
     */
    assert.ok(
      photos.some((photo) => photo.src === `/houses/${house}.jpg`),
      `${house} dropped its share image from the gallery`,
    );
    assert.notEqual(photos[0]!.caption, 'Listing photo', `${house} opens on the generic share image`);
    for (const photo of photos) {
      assert.ok(photo.caption.trim().length > 0, `${house} has an uncaptioned photo`);
      assert.equal(photo.caption.includes('$'), false, `${house} photo caption quotes a price: ${photo.caption}`);
      assert.equal(/door\s*code|wi-?fi|password/i.test(photo.caption), false, `${house} photo caption leaks access`);
    }
  }
  // River has no photographs of the finished house, so its lead picture is a labeled rendering.
  assert.match(houseGallery('river')[0]!.caption, /rendering/i);

  const gallery = readFileSync(join(root, 'src/components/HouseGallery.tsx'), 'utf8');
  assert.match(gallery, /photos\.length > 1/, 'the gallery has no single-photo branch');
  assert.match(gallery, /if \(!lead\) return null/, 'an empty gallery renders a broken frame');
  // No duplicate: the cover is not repeated from the listed set.
  const photos = readFileSync(join(root, 'src/lib/house-photos.ts'), 'utf8');
  assert.match(photos, /seen\.has/, 'the gallery can repeat the cover image');
});

test('a shared house link carries an image and a card type', () => {
  /*
   * A preview with no image renders as a grey box. The image has to be an absolute URL, because a relative one is ignored by the
   * scrapers that build the preview.
   */
  for (const house of ['ranch', 'lindon', 'river'] as const) {
    const share = publicShare(house);
    assert.ok(share.image, `${house} has no share image`);
    assert.match(share.image!, /^https:\/\//, `${house} has a relative share image`);
    assert.match(share.image!, /\.jpg$/, `${house} share image is not a photo`);
  }
  assert.ok(publicShare('index').image);

  // The static document carries them too, because a scraper does not run the app.
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  assert.match(html, /property="og:image"/);
  assert.match(html, /name="twitter:card"/);
  assert.match(html, /name="twitter:image"/);
  // And the description describes the houses, not the management board.
  assert.doesNotMatch(html, /Short-term rental management board/, 'the public description still describes the dashboard');
});

test('the manifest opens the guest site and the sitemap lists the policies', () => {
  const manifest = JSON.parse(readFileSync(join(root, 'public/manifest.webmanifest'), 'utf8')) as {
    start_url?: string;
    name?: string;
  };
  // It used to be "/", which installed the management dashboard onto a guest's phone.
  assert.equal(manifest.start_url, '/houses/');
  assert.equal(manifest.name, 'Utah Mountain Luxury');

  const sitemap = readFileSync(join(root, 'public/sitemap.xml'), 'utf8');
  for (const page of ['terms', 'privacy', 'accessibility']) {
    assert.match(sitemap, new RegExp(`/${page}<`), `the sitemap omits /${page}`);
  }
  // Extensionless, because Pages answers the .html form with a redirect.
  assert.doesNotMatch(sitemap, /\/terms\.html/, 'the sitemap lists a URL that redirects');
});

test('the share tag follows the host the page is served from', () => {
  // It was hardcoded to pages.dev, so a link shared from a custom domain pointed a scraper at the wrong host.
  /*
   * The share tags are built in `house-page.ts` now, not in a page component: the listing, the house list, and the
   * `/book/` route all read the same `applyPublicShare`. Retargeted here so the property is still guarded — a share URL
   * pinned to one host would preview the wrong address from a custom domain.
   */
  const share = readFileSync(join(root, 'src/lib/house-page.ts'), 'utf8');
  assert.match(share, /ORIGIN|location\.origin/, 'the share URL is not built from a host at all');
  assert.doesNotMatch(share, /og:url'\);\s*\n\s*if \(node\) node\.setAttribute\('content', `https:\/\/wilhite-portfolio/);
});
