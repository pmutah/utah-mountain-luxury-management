import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

/*
 * An owner read "$0" on a house that has $20,733 of confirmed bookings.
 *
 * Todd opened his statement on 2026-11-08. The year-to-date window ran **January to November**, and the River House
 * showed 0 stays and $0 across the board — while two confirmed River stays (Dec 10–13, $5,016 and Dec 28–Jan 2,
 * $15,717) were already on the calendar.
 *
 * The arithmetic is right: a settled statement must not include nights that have not happened, or "what we earned"
 * and "what is booked" become the same number. I checked the window label and the month list — January through
 * November, no December row — and did not change the report.
 *
 * What was missing is the sentence that stops a zero being read as the house's whole story. The portal already says
 * "There is no Ranch or River statement for this period yet. That is not a zero." for an *empty* window; this is the
 * partial case, which is the more dangerous one, because the page looks full and one line in it is still misleading.
 */

const portal = readFileSync(new URL('../../components/OwnerPortal.tsx', import.meta.url), 'utf8');

test('the statement says its window ends before nights that are already booked', () => {
  assert.match(portal, /data-bot="owner-portal-window"/, 'the closed-window note is gone');
  assert.match(portal, /completed months only/, 'the note no longer says the window is closed');
  assert.match(portal, /already booked later in the/, 'the note no longer mentions nights already booked');
  assert.match(portal, /not an empty house/, 'the note no longer disambiguates a zero');
});

test('the empty-window note is still there, because it is a different case', () => {
  // Two different misleading cases, two different sentences. Replacing one with the other would lose a case.
  assert.match(portal, /There is no Ranch or River statement for this period yet/, 'the empty-window note was removed');
  assert.match(portal, /That is not a zero/, 'the empty-window note lost its point');
});

test('the portal still does not put forward bookings into a settled statement', () => {
  /*
   * The temptation was to add the December stays to the River line so the house did not look idle. That would be
   * wrong — it mixes settled results with reservations — so this pins the boundary rather than the display: the view
   * is built from the statement's houses, not from a reservation list. It reads identifiers, not prose, because the
   * note I added says "already booked" and a text match would flag the explanation rather than a leak.
   */
  assert.equal(
    /api\/reservations|\bgetAllReservations\b|\.checkIn\b/.test(portal),
    false,
    'the portal started reading live bookings into a settled statement',
  );
  assert.match(portal, /OwnerPortalView/, 'the portal no longer renders the statement view it is given');
});
