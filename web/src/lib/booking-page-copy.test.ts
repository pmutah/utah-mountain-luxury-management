import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

/*
 * What the booking page promises a guest, pinned.
 *
 * The copy has been wrong in three directions over this project's life, so each correction is recorded here rather than
 * left to the next editor:
 *
 *   1. *"This is a preview of our own booking page… Live direct booking still runs on the Hospitable site."* That
 *      understated the product. A request really does save, hold the nights for thirty minutes, email the team, and
 *      return a status link, so a guest reading "preview" would reasonably close the tab and book elsewhere.
 *   2. *"Direct requests are being trialled"* plus a pointer to Airbnb and VRBO. That was honest while direct booking
 *      was a trial. The owner has since chosen direct-only for this site, so the trial sentence and the outbound
 *      channel pointer are gone on purpose — keeping them would send a guest away from the page they are on.
 *   3. The rebuild from the old `/book/` page to the visual listing.
 *
 * What does not change, whatever the marketing says: the page never charges a card, it says so, and it never presents a
 * request as an instant confirmation.
 */

const INDEX = readFileSync(join(process.cwd(), 'src', 'components', 'HouseSite.tsx'), 'utf8');
const CARD = readFileSync(join(process.cwd(), 'src', 'components', 'DirectReserveCard.tsx'), 'utf8');

/** The house list's opening paragraph, so a rule cannot be satisfied by text elsewhere on a long page. */
function openingCopy(): string {
  const start = INDEX.indexOf('Three houses for the people you travel with');
  assert.ok(start > 0, 'the house list no longer has its opening heading');
  return INDEX.slice(start, start + 900);
}

test('the page does not call itself a preview, because a request really does save and hold', () => {
  for (const copy of [openingCopy(), CARD]) {
    assert.doesNotMatch(copy, /This is a preview/i, 'the page again tells a guest it is only a preview');
    assert.doesNotMatch(
      copy,
      /Live direct booking still runs on the Hospitable site/i,
      'the page again says booking only happens elsewhere',
    );
  }
});

test('the page is direct-only and no longer calls itself a trial', () => {
  /*
   * The owner chose direct-only on 2026-11-12. The old guard required the opposite words, so it is inverted here and
   * says why — a future editor reading only the assertion would otherwise "fix" the page back to pointing at Airbnb.
   */
  const all = `${openingCopy()} ${CARD}`;
  assert.doesNotMatch(all, /\bbeing trialled\b|\bis a trial\b/i, 'the page calls direct booking a trial again');
  assert.doesNotMatch(
    all,
    /book through our listing on Airbnb|if you need a confirmed booking today/i,
    'the page again sends a guest to a channel instead of booking here',
  );
});

test('the page says what it does: no card now, and the dates are held while we reply', () => {
  assert.match(CARD, /No card now/, 'the card no longer says that no card is charged');
  assert.match(CARD, /holds these nights for 30 minutes/, 'the card no longer says the dates are held, not booked');
  // A sentence promising a charge would be the most expensive kind of wrong.
  assert.doesNotMatch(CARD, /we will charge|card will be charged|pay now|charged today/i, 'the card promises a charge');
});

test('the page never presents a request as a confirmed booking', () => {
  assert.match(CARD, /Request to book/, 'the primary action is no longer a request');
  assert.doesNotMatch(CARD, /Book now|Instantly book|Confirm booking/i, 'the action promises an instant confirmation');
});

test('the tax estimate is named as an estimate, because it is confirmed later', () => {
  /*
   * The card now shows an all-in figure. A number that looks final and then changes at the desk is the kind of
   * surprise this page exists to avoid, so the estimate must say it is one.
   */
  assert.match(CARD, /stay-tax-estimate/, 'the tax estimate lost its hook');
  assert.match(CARD, /about \$\{?/, 'the total is presented as exact rather than estimated');
  assert.match(CARD, /confirmed with the booking/i, 'the estimate does not say when the tax is settled');
});
