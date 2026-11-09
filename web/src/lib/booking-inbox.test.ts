import assert from 'node:assert/strict';
import test from 'node:test';
import { bookingInbox, inboxSummary } from './booking-inbox.ts';

const request = (over: Record<string, unknown> = {}) => ({
  id: 'book-1',
  name: 'Ada Lovelace',
  propertyId: 'river',
  checkIn: '2026-12-01',
  checkOut: '2026-12-04',
  guests: 8,
  createdAt: '2026-11-06T18:00:00.000Z',
  note: 'Secret note text',
  ...over,
});

test('a request names its house and dates and keeps the name and note off the line', () => {
  const rows = bookingInbox([request()], { river: [] }, '2026-11-07');
  assert.equal(rows.length, 1);
  assert.match(rows[0]!.line, /The River House, Dec 1 to Dec 4, 8 guests/);
  assert.match(rows[0]!.line, /not on the calendar/);
  assert.equal(rows[0]!.taken, false);
  assert.equal(rows[0]!.line.includes('Ada'), false);
  assert.equal(rows[0]!.line.includes('Secret'), false);
  assert.equal(rows[0]!.line.includes('$'), false);
  assert.equal(rows[0]!.ageDays, 1);
  assert.equal(rows[0]!.stale, false);
});

test('a night already on the calendar is named and nothing is booked', () => {
  const rows = bookingInbox([request()], { river: ['2026-12-02'] }, '2026-11-07');
  assert.equal(rows[0]!.taken, true);
  assert.match(rows[0]!.line, /already on the calendar/);
  assert.match(rows[0]!.line, /Nothing is booked/);
});

test('a two-house request names both houses and either one taking the nights counts', () => {
  const rows = bookingInbox([request({ alsoPropertyId: 'ranch', guests: 30 })], { river: [], ranch: ['2026-12-03'] }, '2026-11-07');
  assert.match(rows[0]!.houseLine, /The River House and The Ranch House/);
  assert.equal(rows[0]!.houses.length, 2);
  assert.equal(rows[0]!.taken, true);
  const both = bookingInbox([request({ alsoPropertyId: 'ranch', guests: 30 })], { river: [], ranch: [] }, '2026-11-07');
  assert.equal(both[0]!.taken, false);
  assert.match(both[0]!.line, /30 guests/);
});

test('children are named and a request older than two days is called waiting', () => {
  const rows = bookingInbox([request({ children: 2, createdAt: '2026-11-01T12:00:00.000Z' })], { river: [] }, '2026-11-07');
  assert.match(rows[0]!.line, /including 2 children/);
  assert.equal(rows[0]!.stale, true);
  assert.equal(rows[0]!.ageDays, 6);
  const summary = inboxSummary(rows);
  assert.match(summary, /1 has waited more than 2 days/);
  assert.equal(summary.includes('Ada'), false);
});

test('an unnamed house, a bad date, and a missing party size stay out or say so', () => {
  assert.deepEqual(bookingInbox([request({ propertyId: 'denver' })], {}, '2026-11-07'), []);
  assert.deepEqual(bookingInbox([request()], {}, 'not-a-day'), []);
  const rows = bookingInbox([request({ guests: undefined, checkIn: '', checkOut: '' })], {}, '2026-11-07');
  assert.equal(rows.length, 1);
  assert.match(rows[0]!.line, /no dates/);
  assert.match(rows[0]!.line, /no party size/);
  assert.equal(rows[0]!.taken, false);
});

test('the summary does not chase a host about a request already answered', () => {
  const rows = bookingInbox([request({ createdAt: '2026-11-01T12:00:00.000Z' })], { river: [] }, '2026-11-07');
  // A declined or accepted request is answered, so it is not waiting and cannot be called late.
  assert.match(inboxSummary([{ ...rows[0]!, declined: true }]), /All 1 requests have an answer|The 1 request has an answer/);
  assert.equal(/waiting/.test(inboxSummary([{ ...rows[0]!, declined: true }])), false);
  assert.equal(/waited more than 2 days/.test(inboxSummary([{ ...rows[0]!, declined: true }])), false);
  assert.equal(/waited more than 2 days/.test(inboxSummary([{ ...rows[0]!, accepted: true }])), false);
  // A request with no answer still counts.
  assert.match(inboxSummary(rows), /1 direct request is waiting/);
});

test('the host inbox never carries the guest status token', () => {
  // The token is the guest's own credential. A host list that echoed it would hand every guest's
  // request page to anyone who can read the desk.
  const rows = bookingInbox(
    [request({ statusToken: 'a'.repeat(32) })],
    { river: [] },
    '2026-11-07',
  );
  const text = JSON.stringify(rows);
  assert.equal(text.includes('a'.repeat(32)), false, 'the guest status token reached the host desk');
  assert.equal(text.includes('statusToken'), false);
});

test('the summary never calls the list complete when requests are hidden', () => {
  /*
   * The list is capped at 12 and the summary was computed from those 12. Twelve answered rows plus
   * eight hidden waiting ones read as "All 12 requests have an answer", so eight guests were never
   * answered and nothing on the desk said so.
   */
  const answered = Array.from({ length: 12 }, (_, i) => ({
    ...request({ id: `book-${i}` }),
  }));
  const rows = bookingInbox(answered, { river: [] }, '2026-11-07');
  const flagged = rows.map((row) => ({ ...row, accepted: true }));

  // Nothing hidden: the old wording is right.
  assert.match(inboxSummary(flagged), /All 12 requests have an answer/);
  assert.equal(/not shown on this list/.test(inboxSummary(flagged)), false);

  // Eight hidden: it must say so, and must not claim everything is answered.
  const withHidden = inboxSummary(flagged, 8);
  assert.match(withHidden, /8 more are not shown on this list/);
  assert.equal(/All 12 requests have an answer/.test(withHidden), false, 'a hidden backlog was called answered');
  assert.match(withHidden, /Nothing is booked/);

  assert.match(inboxSummary(flagged, 1), /1 more is not shown on this list/);
  // A negative or nonsense count is not a claim.
  assert.match(inboxSummary(flagged, -3), /All 12 requests have an answer/);
});

test('the cap drops the newest requests, not the ones that have waited longest', () => {
  // 20 requests. The first ten were saved a week ago, the last ten yesterday, so the first ten have
  // waited longest and are the ones that must not be dropped.
  const many = Array.from({ length: 20 }, (_, i) => ({
    id: `book-${String(i).padStart(2, '0')}`,
    propertyId: 'river',
    checkIn: '2027-02-01',
    checkOut: '2027-02-04',
    guests: 8,
    createdAt: i < 10 ? '2026-10-31T09:00:00.000Z' : '2026-11-06T09:00:00.000Z',
  }));
  const rows = bookingInbox(many as never, { river: [] }, '2026-11-07');
  assert.equal(rows.length, 12, 'the limit changed');
  assert.equal(rows[0]!.id, 'book-00', 'the oldest request was not first');
  // All ten old ones are kept; only two of the newer ones fit.
  for (let i = 0; i < 10; i += 1) {
    assert.equal(rows.some((row) => row.id === `book-${String(i).padStart(2, '0')}`), true, `old request ${i} was dropped`);
  }
  assert.equal(rows.some((row) => row.id === 'book-19'), false, 'the newest request was kept while an older one was dropped');
});

test('the inbox stops at the limit and the summary counts the open ones', () => {  const many = Array.from({ length: 5 }, (_, index) => request({ id: `book-${index}` }));
  const rows = bookingInbox(many, { river: ['2026-12-01'] }, '2026-11-07', 3);
  assert.equal(rows.length, 3);
  const summary = inboxSummary(rows);
  assert.match(summary, /3 direct requests are waiting/);
  assert.match(summary, /0 still name a free night/);
  assert.match(inboxSummary([]), /No direct requests are waiting/);
});

test('a part request names the part, and a whole-house request never does', () => {
  const rows = bookingInbox([request({ units: ['main-lodge', 'garage-suite'] })], { river: [] }, '2026-11-07');
  assert.equal(rows.length, 1);
  const partLine = rows[0]!.partLine;
  assert.ok(partLine, 'a part request produced no part line, so a host would read it as the whole house');
  assert.match(partLine, /River Garage Suite and River Main Lodge/);
  assert.match(partLine, /not the whole house/);
  // A whole-house request carries no part line at all.
  const whole = bookingInbox([request()], { river: [] }, '2026-11-07');
  assert.equal(whole[0]!.partLine, undefined, 'a whole-house request claimed to be a part');
  // An empty list means the whole house, which is what every earlier request means.
  const empty = bookingInbox([request({ units: [] })], { river: [] }, '2026-11-07');
  assert.equal(empty[0]!.partLine, undefined, 'an empty unit list was read as a part');
  // A part name we do not sell is shown as typed rather than dropped silently.
  const odd = bookingInbox([request({ units: ['attic'] })], { river: [] }, '2026-11-07');
  assert.match(odd[0]!.partLine ?? '', /attic/);
});
