/**
 * The house page must not quote a price it cannot stand behind.
 *
 * Found in a browser walk of the rebuilt listing page: the reserve card rendered "**$175 below the Airbnb guest
 * total**" at the same moment as "**The calendar could not be read**". Both sentences cannot be true. The saving is
 * computed by comparing the direct total to the channel total, and `quoteStay` will happily compute both from an
 * empty taken list — so a paused or failed calendar still produced a confident discount on dates the page had not
 * checked.
 *
 * The same shape had a second half: with the calendar unread the page still drew a month grid where every night
 * looked available, so a guest could tap a date the house may already be sold on.
 *
 * These are source guards, because the defect is a missing condition in a render path. The quote helpers are
 * correct in isolation and always were.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { quoteCalendarFromAvailability } from './booked-nights.ts';
import { quoteStay, directSavings } from './quote.ts';

const CARD = readFileSync(join(process.cwd(), 'src', 'components', 'DirectReserveCard.tsx'), 'utf8');
const LISTING = readFileSync(join(process.cwd(), 'src', 'components', 'HouseListing.tsx'), 'utf8');

test('a quote with no calendar still produces a saving, which is why the page must gate it', () => {
  /*
   * The premise. If this ever stops being true the rest of the file is testing nothing — but as long as it holds,
   * an unguarded saving line is a discount invented from an empty calendar.
   */
  const quote = quoteStay('ranch', '2026-12-10', '2026-12-13', [], { asOf: '2026-11-12', pace: 'unknown' });
  assert.ok(quote.ok, 'the fixture no longer quotes');
  const saved = directSavings(quote.channelTotal, quote.stayTotal);
  assert.ok(saved !== null && saved > 0, 'an empty calendar no longer yields a saving, so the guard may be redundant');
});

test('the saving is only shown when the calendar was read and the quote is valid', () => {
  /*
   * The exact regression: `saved !== null && !bookingParts` renders the discount with no calendar in the condition.
   * The live condition must name the calendar and the quote.
   */
  const line = CARD.slice(CARD.indexOf('data-bot="stay-save"') - 400, CARD.indexOf('data-bot="stay-save"') + 80);
  assert.match(line, /calendar === 'live'/, 'the saving does not require a read calendar');
  assert.match(line, /quote\.ok/, 'the saving does not require a valid quote');
  assert.match(line, /saved !== null/, 'the saving no longer guards the null case');
});

test('a paused calendar is not an empty calendar', () => {
  // The parser refuses a paused read outright, which is what lets the page tell "no nights taken" from "unknown".
  assert.equal(
    quoteCalendarFromAvailability({ storageReads: 'paused', nights: null, closed: null, held: null }),
    null,
    'a paused read parsed as a real calendar',
  );
});

test('the month grid is not drawn from an unread calendar', () => {
  /*
   * Every night in a grid built from an empty taken list looks bookable. The listing now renders the month only
   * for a live calendar and says plainly why there is none otherwise.
   */
  assert.match(LISTING, /calendar === 'live' \? \(/, 'the calendar panel does not branch on a live calendar');
  assert.match(LISTING, /data-bot="house-calendar-off"/, 'there is no message for an unread calendar');
  assert.match(LISTING, /no night on this page is marked open or booked/, 'the unread message does not say what is missing');
  // The grid itself must not be reachable with a non-live calendar.
  const grid = LISTING.slice(LISTING.indexOf('<StayMonth'), LISTING.indexOf('<StayMonth') + 700);
  assert.equal(/taken=\{calendar === 'live' \? taken/.test(grid), false, 'the month is still fed a conditional taken list');
});

test('the page says a request is a request, not a booking', () => {
  // A guest must never read the button as an instant confirmation.
  assert.match(CARD, /A request holds these nights for 30 minutes/, 'the card does not say the dates are held, not booked');
  assert.equal(/instantly booked|confirmed immediately|booked now/i.test(CARD), false, 'the card claims an instant booking');
});
