import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { moneyLine, requestView, type RequestStatusInput } from './request-status.ts';

/*
 * The guest was quoted a total and then never shown it again.
 *
 * The booking page prints a total and sends it with the request as `quotedTotal` (`DirectReserveCard.tsx`). Nothing on the guest
 * side ever read it: `grep quotedTotal src/` found only the send, plus two host-side helpers in `booking-accept.ts` and
 * `booking-inbox.ts`. Worse, the status page stated the opposite in as many words — "This page shows the house, the dates,
 * and the party. It does not carry a price, a door code, or a way in."
 *
 * So the sequence a guest actually lived was: see $7,300 → request the stay → read a page that says it carries no price.
 * The number vanished at exactly the moment they needed it, and the one question a guest has at that point is what it
 * costs and what happens about paying.
 *
 * These guards pin the fix, and — more importantly — pin the two ways it could go wrong: inventing a figure when none
 * exists, or inventing payment terms the owner has not given.
 */

const SOURCE = readFileSync(join(process.cwd(), 'src', 'lib', 'request-status.ts'), 'utf8');
const PAGE = readFileSync(join(process.cwd(), 'src', 'components', 'RequestStatus.tsx'), 'utf8');
const ROUTE = readFileSync(join(process.cwd(), 'functions', 'api', 'book', 'request', '[token].ts'), 'utf8');

function input(overrides: Partial<RequestStatusInput> = {}): RequestStatusInput {
  return { propertyId: 'river', checkIn: '2026-12-01', checkOut: '2026-12-04', guests: 6, ...overrides };
}

const decision = {
  requestId: 'req-1',
  stays: [],
  decline: null,
  hold: null,
  asOf: '2026-11-10',
  now: '2026-11-10T19:00:00.000Z',
};

test('the total the guest was quoted reaches the guest view', () => {
  const view = requestView(input({ quotedTotal: 7300 }), decision);
  assert.ok(view, 'the view was not built');
  assert.equal(view.quotedTotal, 7300, 'the quote does not reach the guest view');
});

test('a missing or unusable total is absent, never zero', () => {
  /*
   * The failure that matters: a guest reading "$0". `Number('')` is 0, `Number('7300')` is a number that came from a string,
   * and a negative total is nonsense. Every one of those must read as "no figure", so the page says the rate is confirmed
   * in the reply rather than that the stay is free.
   */
  for (const bad of [0, -500, Number.NaN, Number.POSITIVE_INFINITY, '7300', '', null, undefined]) {
    const view = requestView(input({ quotedTotal: bad }), decision);
    assert.ok(view, `the view was not built for ${String(bad)}`);
    assert.equal(view.quotedTotal, undefined, `${String(bad)} was accepted as a guest total`);
  }
});

test('a real total is stated and says nothing has been charged', () => {
  const line = moneyLine({ status: 'waiting', houses: ['river'], checkIn: '2026-12-01', checkOut: '2026-12-04', nights: 3, quotedTotal: 7300 });
  assert.ok(line, 'a quoted request has no money line');
  assert.match(line!, /\$7,300/, 'the quote is not stated');
  assert.match(line!, /Nothing has been charged/, 'the line does not say whether anything was charged');
  assert.match(line!, /no card was collected/i, 'the line does not say a card was not taken');
});

test('no state ever renders a zero-dollar figure', () => {
  /*
   * "0" is the one number that would actively harm a guest — it reads as a free stay and could be relied on. Every status is
   * checked with and without a quote.
   */
  for (const status of ['waiting', 'accepted', 'expired', 'declined', 'cancelled'] as const) {
    for (const quotedTotal of [undefined, 7300]) {
      const view = { status, houses: ['river'] as const, checkIn: '2026-12-01', checkOut: '2026-12-04', nights: 3, ...(quotedTotal !== undefined ? { quotedTotal } : {}) };
      const line = moneyLine({ ...view, houses: [...view.houses] }) ?? '';
      assert.equal(/\$0(?![,\d])/.test(line), false, `${status} printed a $0 figure: ${line}`);
    }
  }
});

test('the app does not invent payment terms the owner never gave', () => {
  /*
   * There is no deposit percentage, no due date, and no refund window anywhere in this repo, and a guest-facing sentence is
   * the worst place to guess one. The line may say the guest was quoted a total and that nothing has been charged; it may
   * not state a percentage, a deadline, or a forfeiture rule.
   */
  for (const status of ['waiting', 'accepted'] as const) {
    const line =
      moneyLine({ status, houses: ['river'], checkIn: '2026-12-01', checkOut: '2026-12-04', nights: 3, quotedTotal: 7300 }) ?? '';
    assert.equal(/\b\d{1,2}%/.test(line), false, `a deposit percentage was invented: ${line}`);
    assert.equal(/deposit/i.test(line), false, `a deposit rule was invented: ${line}`);
    assert.equal(/non-refundable|forfeit|due within|days before/i.test(line), false, `a refund or due-date rule was invented: ${line}`);
  }
});

test('a declined or cancelled stay says nothing about money', () => {
  // Nothing is owed on a request that was refused, and a cancelled stay's money is not this page's business.
  for (const status of ['declined', 'cancelled'] as const) {
    const line = moneyLine({ status, houses: ['river'], checkIn: '2026-12-01', checkOut: '2026-12-04', nights: 3, quotedTotal: 7300 });
    assert.equal(line, null, `${status} drew a money line`);
  }
});

test('the page draws the line and no longer claims it carries no price', () => {
  assert.match(PAGE, /moneyLine\(/, 'the page does not compute a money line');
  assert.match(PAGE, /data-bot="request-money"/, 'the money line is not drawn');
  // `data-quoted` is what lets a test see the difference between "no figure" and "a figure" on the rendered element.
  assert.match(PAGE, /data-quoted=/, 'the page does not record whether a quote was shown');
  /*
   * The old footnote said the page "does not carry a price". It was false once the quote was added, and it was never quite
   * honest before, because the booking page had already shown the guest one.
   *
   * Comments are stripped first: this guard's own explanatory comment quotes the old sentence, and a file-wide search matched
   * that quote - the same prose-matching false positive that has recurred all session.
   */
  const PAGE_CODE = PAGE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
  assert.equal(
    /does not carry a price/.test(PAGE_CODE),
    false,
    'the page still says it carries no price',
  );
});

test('the route forwards the total, because it rebuilds its response field by field', () => {
  /*
   * The route does not spread the view — it lists fields — so a new field on `RequestView` does not reach the guest by itself.
   * That is exactly how `parts` was once lost, and the comment in the route says so.
   */
  assert.match(ROUTE, /quotedTotal: view\.quotedTotal/, 'the route does not forward the quoted total');
});
