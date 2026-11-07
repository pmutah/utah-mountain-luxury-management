/**
 * The guest's own view of a direct request. Two things must hold: a guest can tell "waiting" from
 * "declined", and the page never leaks a name, a contact detail, a note, or a price.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  holdLine,
  requestHouseLine,
  requestStatusLine,
  requestView,
  type RequestStatusDecision,
} from './request-status.ts';

const AS_OF = '2026-11-07';

function decision(over: Partial<RequestStatusDecision> = {}): RequestStatusDecision {
  return { requestId: 'book-1', stays: [], decline: null, hold: null, asOf: AS_OF, ...over };
}

const REQUEST = {
  propertyId: 'river',
  checkIn: '2026-12-01',
  checkOut: '2026-12-04',
  guests: 20,
  children: 0,
};

test('a saved request with no decision is waiting, and names no price', () => {
  const view = requestView(REQUEST, decision());
  assert.equal(view?.status, 'waiting');
  assert.equal(view?.nights, 3);
  assert.equal(view?.guests, 20);
  const line = requestStatusLine(view!);
  assert.match(line, /request/i);
  assert.equal(line.includes('$'), false);
  assert.equal(/\bbooked\b/i.test(line), false);
  assert.equal(/\bconfirmed\b/i.test(line), false);
});

test('an accepted stay reads as confirmed, and a different request on the same nights does not', () => {
  const accepted = requestView(
    REQUEST,
    decision({ stays: [{ note: 'Direct request book-1. Party of 20.', status: 'confirmed' }] }),
  );
  assert.equal(accepted?.status, 'accepted');
  assert.match(requestStatusLine(accepted!), /confirmed/i);

  // A stay for another request that happens to cover the same nights must not read as this one.
  const other = requestView(
    REQUEST,
    decision({ stays: [{ note: 'Direct request book-9. Someone else.', status: 'confirmed' }] }),
  );
  assert.equal(other?.status, 'waiting', 'another guest\'s stay made this request look booked');
});

test('a cancelled stay does not read as accepted', () => {
  const view = requestView(
    REQUEST,
    decision({ stays: [{ note: 'Direct request book-1.', status: 'cancelled' }] }),
  );
  assert.equal(view?.status, 'cancelled');
});

test('a decline reads as declined with a plain reason and no price', () => {
  const view = requestView(
    REQUEST,
    decision({ decline: { reason: 'too-many-guests', at: '2026-11-07T15:00:00.000Z' } }),
  );
  assert.equal(view?.status, 'declined');
  assert.match(view?.reason ?? '', /party this size/);
  assert.equal(view?.answeredAt, '2026-11-07T15:00:00.000Z');
  const line = requestStatusLine(view!);
  assert.equal(line.includes('$'), false);
  assert.equal(/\bbooked\b/i.test(line), false);
});

test('a decline with a reason we do not know still says something true', () => {
  const view = requestView(REQUEST, decision({ decline: { reason: 'nonsense', at: 'x' } }));
  assert.equal(view?.status, 'declined');
  assert.match(view?.reason ?? '', /not open this time/);
  assert.equal(view?.answeredAt, undefined, 'a bad timestamp was passed through');
});

test('a live hold names the time, and a hold that has run out reads expired', () => {
  const live = requestView(REQUEST, decision({ hold: { expiresAt: '2099-11-07T20:30:00.000Z' } }));
  assert.equal(live?.status, 'waiting');
  assert.equal(live?.heldUntil, '2099-11-07T20:30:00.000Z');
  assert.match(holdLine(live!) ?? '', /Mountain time/);
  assert.equal((holdLine(live!) ?? '').includes('$'), false);

  const gone = requestView(REQUEST, decision({ hold: { expiresAt: '2026-11-01T20:30:00.000Z' } }));
  assert.equal(gone?.status, 'expired', 'a hold that let go still read as waiting');
  assert.equal(holdLine(gone!), null, 'an expired hold showed a clock');
  assert.match(requestStatusLine(gone!), /hold on these dates has ended/i);
});

test('a hold that ran out earlier today is over, not still running', () => {
  // Two ISO strings on the same date compare equal by day, which made a hold that ended at 9:00 AM
  // still read as live at noon. The instant has to be compared, not the day.
  const gone = requestView(REQUEST, {
    ...decision({ hold: { expiresAt: '2026-11-07T16:00:00.000Z' } }),
    now: '2026-11-07T19:00:00.000Z',
  });
  assert.equal(gone?.status, 'expired', 'a hold that ended this morning read as still running');
  assert.equal(holdLine(gone!), null);

  const running = requestView(REQUEST, {
    ...decision({ hold: { expiresAt: '2026-11-07T20:30:00.000Z' } }),
    now: '2026-11-07T19:00:00.000Z',
  });
  assert.equal(running?.status, 'waiting');
  assert.equal(running?.heldUntil, '2026-11-07T20:30:00.000Z');
});

test('without an exact clock the day is still used, so an old hold is never called live', () => {
  const gone = requestView(REQUEST, decision({ hold: { expiresAt: '2026-11-01T20:30:00.000Z' } }));
  assert.equal(gone?.status, 'expired');
});

test('a cancelled booking is not reported as an unanswered request', () => {
  // The guest was answered: we accepted, then called the stay off. "Nobody replied in time" is a
  // different and false story, so a cancelled stay has its own state.
  const view = requestView(
    REQUEST,
    decision({
      stays: [{ note: 'Direct request book-1.', status: 'cancelled' }],
      hold: { expiresAt: '2026-11-07T20:30:00.000Z', released: true },
    }),
  );
  assert.equal(view?.status, 'cancelled');
  const line = requestStatusLine(view!);
  assert.match(line, /cancelled/i);
  assert.equal(/nobody answered/i.test(line), false, 'a cancelled stay was called unanswered');
  assert.equal(line.includes('$'), false);
});

test('a cancelled stay beside a live one still reads as confirmed', () => {
  // A two-house request writes one stay per house. Cancelling one house must not hide the other.
  const view = requestView(
    REQUEST,
    decision({
      stays: [
        { note: 'Direct request book-1.', status: 'cancelled' },
        { note: 'Direct request book-1.', status: 'confirmed' },
      ],
    }),
  );
  assert.equal(view?.status, 'accepted');
});

test('an accepted request wins over a stale hold', () => {  const view = requestView(
    REQUEST,
    decision({
      stays: [{ note: 'Direct request book-1.', status: 'confirmed' }],
      hold: { expiresAt: '2099-11-07T20:30:00.000Z' },
    }),
  );
  assert.equal(view?.status, 'accepted');
});

test('a request with no usable dates or house is not shown at all', () => {
  assert.equal(requestView({ ...REQUEST, checkIn: '2026-13-01' }, decision()), null);
  assert.equal(requestView({ ...REQUEST, checkOut: '2026-12-01' }, decision()), null);
  assert.equal(requestView({ ...REQUEST, propertyId: 'garage' }, decision()), null);
  assert.equal(requestView({ ...REQUEST, guests: 1.5 }, decision())?.guests, undefined);
});

test('a two-house request names both houses in one line', () => {
  const view = requestView({ ...REQUEST, alsoPropertyId: 'ranch' }, decision());
  assert.deepEqual(view?.houses, ['river', 'ranch']);
  assert.equal(requestHouseLine(view!.houses), 'The River House and The Ranch House');
  assert.equal(requestHouseLine(['lindon']), 'The Lindon House');
  assert.equal(requestHouseLine([]), '');
});

test('the guest wording never carries a dollar figure', () => {
  const states = [
    requestView(REQUEST, decision()),
    requestView(REQUEST, decision({ decline: { reason: 'dates-taken', at: '2026-11-06T00:00:00.000Z' } })),
    requestView(REQUEST, decision({ hold: { expiresAt: '2026-11-01T00:00:00.000Z' } })),
    requestView(REQUEST, decision({ stays: [{ note: 'Direct request book-1.', status: 'confirmed' }] })),
  ];
  for (const view of states) {
    assert.ok(view);
    const text = `${requestStatusLine(view)} ${holdLine(view) ?? ''}`;
    assert.equal(text.includes('$'), false, text);
  }
});
