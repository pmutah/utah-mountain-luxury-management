/**
 * A night another guest is holding must not look free.
 *
 * `POST /api/book` refuses a request for a held night with a 409 while the 30-minute hold lives. The calendar payload
 * carries those nights in its own `held` field precisely so the page can show them apart from a booking — and the rebuilt
 * listing read `nights` and `closed` and dropped `held` on the floor.
 *
 * The result was the worst shape of this bug: the page said a night was free, the guest filled in name, email, phone and
 * a note, ticked the rules, and only then met a refusal. A hold is not a booking, and nothing here should call it one —
 * but it is also not available.
 *
 * Source guards, because the defect is a field that never reaches the component, which no unit test of the quote helpers
 * can observe.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const LISTING = readFileSync(new URL('../components/HouseListing.tsx', import.meta.url), 'utf8');
const CARD = readFileSync(new URL('../components/DirectReserveCard.tsx', import.meta.url), 'utf8');

test('the listing keeps the held nights it is given', () => {
  assert.match(LISTING, /setHeld\(result\.held\)/, 'the page reads the calendar but throws away the held nights');
  assert.match(LISTING, /held=\{held\}/, 'the card is never given the held nights');
});

test('a held night is drawn as unavailable, not as free', () => {
  // The month grid is fed closed plus held, so a held night cannot be picked as a check-in.
  assert.match(
    LISTING,
    /blocked=\{(monthCal\.both \? monthCal\.closed : )?\[\.\.\.\(closed\[house\.id\] \?\? \[\]\), \.\.\.\(held\[house\.id\] \?\? \[\]\)\]\}/,
    'the calendar does not treat a held night as unavailable',
  );
});

test('every gate on the card treats a held night the same way', () => {
  /*
   * The quote, the checkout limit, the check-in guard, and the submit gate all read taken/closed. Threading a fifth list
   * through each of them is how two of the four end up disagreeing, so the card composes it once.
   */
  assert.match(CARD, /const closedNights = \[\.\.\.\(closed\[house\] \?\? \[\]\), \.\.\.\(held\[house\] \?\? \[\]\)\]/, 'the card does not compose held nights into the unavailable list');
  /*
   * Count the *usages*, not the definitions. The two lines that define `takenNights`/`closedNights` necessarily read the
   * raw arrays — that is what composing means — so a blanket search for `taken[house]` can never pass. Every other
   * occurrence must be the composed name.
   */
  const gates = CARD.split('\n').filter((line) => /takenNights|closedNights/.test(line)).length;
  assert.ok(gates >= 5, `only ${gates} lines use the composed lists; a gate is still reading the raw arrays`);
  const raw = CARD.split('\n').filter(
    (line) => /taken\[house\] \?\? \[\]|closed\[house\] \?\? \[\]/.test(line) && !/const (takenNights|closedNights)/.test(line),
  );
  assert.deepEqual(raw, [], `these lines read the raw arrays and would miss a held night:\n${raw.join('\n')}`);
});

test('the copy never calls a hold a booking', () => {
  /*
   * The distinction the server makes has to survive onto the page. A guest told "booked" when the night is merely held
   * has been told something false about their own calendar.
   */
  assert.equal(
    /held nights? (are|is) booked|those nights are booked/i.test(CARD),
    false,
    'the card describes a held night as a booking',
  );
  // And the request confirmation says the dates are held, not booked.
  assert.match(CARD, /Nothing is booked yet/, 'the hold confirmation no longer distinguishes a hold from a booking');
});
