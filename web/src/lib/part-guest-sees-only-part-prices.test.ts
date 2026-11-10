/**
 * A part guest is never shown a whole-house price as if it were their stay.
 *
 * Found in a browser walk of the live booking page. With the Main Lodge chosen, the quote was right — "$1,790 for 2 nights"
 * for $745 × 2 plus $300 cleaning — but the "arrivals this page will quote" chips beside it still read **$3,600** and
 * **$3,780**, which are the whole-house figures from `openArrivals`. It calls `nightAsk(house)` and knows nothing about parts.
 *
 * Two numbers for one stay, one of them 2× the other, on the page a guest reads to decide. That is the same class as the
 * $1,340 overstatement recorded on the accept route: the guest's figure and a figure beside it that is not theirs.
 *
 * The honest fix is to leave the price off while a part is chosen — the dates are still useful, and picking one re-quotes the
 * part. `arrivalChipText` already supports that through its own flag.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { arrivalChipText } from './open-arrivals.ts';

const PAGE = readFileSync('src/components/DirectBook.tsx', 'utf8');

test('the chip text drops the price when asked', () => {
  // The mechanism the fix relies on. A label alone is a valid chip.
  assert.equal(arrivalChipText('November 14, 2026 · 2 nights', '$3,780', false), 'November 14, 2026 · 2 nights');
  assert.equal(arrivalChipText('November 14, 2026 · 2 nights', '$3,780', true), 'November 14, 2026 · 2 nights · $3,780');
});

test('the arrival chips hide the whole-house price while a part is chosen', () => {
  /*
   * `item.direct` is the whole-house figure. The chip must not carry it when `bookingParts` is set, and the hiding goes through
   * the function's own flag rather than a placeholder string — passing `''` would have rendered a dangling separator.
   */
  assert.match(PAGE, /arrivalChipText\(/, 'the chips no longer use the shared helper');
  assert.match(
    PAGE,
    /\(guestCount === null \|\| party\.ok\) && !bookingParts/,
    'the chip still shows a whole-house price while a part is chosen',
  );
  assert.equal(
    /arrivalChipText\(item\.label, bookingParts \? null/.test(PAGE),
    false,
    'a placeholder is being passed where the flag belongs',
  );
});

test('the note above the chips tells the truth about what they price', () => {
  /*
   * With a part chosen the chips no longer carry a figure, so the standing line "the shortest stay this page will quote" would
   * read as if the chips were still quoted. It says what they do instead.
   */
  assert.match(PAGE, /quotes the part you chose/, 'the note does not say the chips quote the chosen part');
});

test('a whole-house guest still sees the price on each chip', () => {
  // The fix must not remove the price for the common case.
  assert.equal(
    /&& !bookingParts/.test(PAGE),
    true,
    'the part condition is gone, so a part guest would see a house price again',
  );
});
