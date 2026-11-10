/**
 * A booking must be worth what the guest was shown.
 *
 * The guest page quotes with the **real year pace**, so a short year turns on the 20% fill promotion. The accept route
 * recomputed the guest total with `pace: 'unknown'`, which switches that promotion off — so the same three-night River stay
 * was shown at **$5,960** and recorded at **$7,300**.
 *
 * A $1,340 gap on one booking, and it flowed into the owner statement and any invoice built from the booking. The guest was
 * never told; the host was never told.
 *
 * The request now carries the figure the page displayed, and accept records that. A fresh quote is still computed so a
 * disagreement can be reported rather than silently resolved — a season-table change and a client sending a number it was
 * never shown both look identical from here.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { quoteStay } from './quote.ts';
import { quotedTotalNote } from './booking-accept.ts';

test('the pace really does change what a guest is quoted', () => {
  /*
   * The premise of the bug, pinned so it cannot be dismissed as theoretical. If this ever stops being true the rest of this
   * file is testing nothing.
   */
  const unknown = quoteStay('river', '2027-02-10', '2027-02-13', [], { guests: 8 });
  const short = quoteStay('river', '2027-02-10', '2027-02-13', [], { guests: 8, pace: 'short' });

  assert.ok(unknown.ok && short.ok, 'the fixture no longer quotes');
  assert.notEqual(
    unknown.stayTotal,
    short.stayTotal,
    'the pace no longer changes the total, so an unknown-pace accept no longer under- or over-charges',
  );
  assert.ok(
    short.stayTotal < unknown.stayTotal,
    'a short year should quote lower through the fill promotion',
  );
});

test('the guest page sends the figure it is showing', () => {
  const PAGE = fs.readFileSync('src/components/DirectBook.tsx', 'utf8');
  assert.match(PAGE, /quotedTotal: splitTotal/, 'the page does not send the total it displays');
  // `splitTotal` is the same variable the page renders, so the two cannot drift.
  assert.match(PAGE, /const splitTotal = bookingParts \? partTotal : quote\.stayTotal/, 'splitTotal changed shape');
});

test('the request keeps the quote, and only when it is a real figure', () => {
  const ROUTE = fs.readFileSync('functions/api/book/index.ts', 'utf8');
  assert.match(ROUTE, /quotedTotal\?: number/, 'the request type does not carry a quote');
  assert.match(
    ROUTE,
    /typeof body\.quotedTotal === 'number' && Number\.isFinite\(body\.quotedTotal\) && body\.quotedTotal > 0/,
    'the route stores a quote without checking it is a positive number',
  );
});

test('accept records the guest quote instead of recomputing it away', () => {
  const ROUTE = fs.readFileSync('functions/api/book/accept.ts', 'utf8');
  assert.match(
    ROUTE,
    /saved\.quotedTotal !== undefined && Number\.isFinite\(saved\.quotedTotal\) && saved\.quotedTotal > 0\s*\?\s*\{ ok: true as const, stayTotal: saved\.quotedTotal \}/,
    'accept does not prefer the guest quote',
  );
});

test('a disagreement is reported with both figures', () => {
  /*
   * The guest quoted $5,960 (with the fill promotion) and today's card says $7,300 — so today is **more**, and the cause to
   * offer is a rate that rose or a promotion that ended. My first version of this test asserted "promotion may have
   * ended", which is the wording my code uses for the *other* direction; the code was right.
   */
  const note = quotedTotalNote(5960, 7300);
  assert.ok(note, 'no note for a real disagreement');
  assert.match(note!, /\$5,960\.00/, 'the guest figure is not named');
  assert.match(note!, /\$7,300\.00/, 'the fresh figure is not named');
  assert.match(note!, /\$1,340\.00/, 'the difference is not named');
  assert.match(note!, /recorded at/, 'the note does not say which figure the booking uses');
});

test('the direction of the difference changes the cause it offers', () => {
  // Guest quoted more than today: a promotion has probably ended since they asked.
  const ended = quotedTotalNote(7300, 5960);
  assert.ok(ended);
  assert.match(ended!, /promotion may have ended/, 'the cause is wrong when the guest was quoted more');

  // Guest quoted less than today: the rate has probably risen.
  const rose = quotedTotalNote(5000, 6000);
  assert.ok(rose);
  assert.match(rose!, /rate may have risen/, 'the cause is wrong when the guest was quoted less');
  assert.doesNotMatch(rose!, /promotion may have ended/);
});

test('a quote lower than today says the rate rose, not that a promotion ended', () => {
  const note = quotedTotalNote(5000, 6000);
  assert.ok(note);
  assert.match(note!, /rate may have risen/, 'the cause is wrong for a guest quoted less than today');
  assert.doesNotMatch(note!, /promotion may have ended/);
});

test('an agreement, or no quote at all, says nothing', () => {
  // Every request made before this field existed carries none, and a note on all of them would be noise.
  assert.equal(quotedTotalNote(undefined, 7300), null, 'a request with no quote produced a note');
  assert.equal(quotedTotalNote(7300, 7300), null, 'an agreeing quote produced a note');
  assert.equal(quotedTotalNote(7300, 7300.004), null, 'a sub-cent difference produced a note');

  // And a fresh quote that could not be computed is not a disagreement.
  assert.equal(quotedTotalNote(7300, null), null, 'a missing fresh quote produced a note');
});

test('a quote lower than today says the rate rose, not that a promotion ended', () => {
  const note = quotedTotalNote(5000, 6000);
  assert.ok(note);
  assert.match(note!, /rate may have risen/, 'the cause is wrong for a guest quoted less than today');
  assert.doesNotMatch(note!, /promotion may have ended/);
});
