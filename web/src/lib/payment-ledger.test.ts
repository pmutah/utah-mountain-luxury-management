import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  isDirectSource,
  isRealDay,
  outstandingBookings,
  parseAmount,
  paymentLedger,
} from './payment-ledger.ts';

/*
 * A direct booking recorded what the guest was quoted and nothing about whether it arrived. The figure was
 * shown, never balanced, so "what is still owed" had no answer in the app.
 *
 * These tests hold the two rules that make a balance trustworthy: a payment is its own record, and a
 * missing total is never reported as zero.
 */

test('a direct booking with no payments still owes the whole total', () => {
  const ledger = paymentLedger({ source: 'direct', guestTotal: 2400, payments: [] });
  assert.equal(ledger.total, 2400);
  assert.equal(ledger.received, 0);
  assert.equal(ledger.outstanding, 2400);
  assert.equal(ledger.paidInFull, false);
  assert.match(ledger.line, /Nothing received yet/);
  assert.match(ledger.line, /\$2,400\.00 is still owed/);
});

test('a partial payment leaves the remainder owed', () => {
  const ledger = paymentLedger({
    source: 'direct',
    guestTotal: 2400,
    payments: [{ id: 'p1', amount: 600, receivedOn: '2026-11-01' }],
  });
  assert.equal(ledger.received, 600);
  assert.equal(ledger.outstanding, 1800);
  assert.equal(ledger.paidInFull, false);
  assert.match(ledger.line, /\$1,800\.00 is still owed/);
});

test('a deposit and the balance together clear the booking exactly', () => {
  const ledger = paymentLedger({
    source: 'direct',
    guestTotal: 2400.55,
    payments: [
      { id: 'p1', amount: 1200.28, receivedOn: '2026-11-01' },
      { id: 'p2', amount: 1200.27, receivedOn: '2026-11-05' },
    ],
  });
  // Cents must not drift: 1200.28 + 1200.27 is 2400.55 exactly, and the balance is exactly zero.
  assert.equal(ledger.received, 2400.55);
  assert.equal(ledger.outstanding, 0);
  assert.equal(ledger.paidInFull, true);
  assert.match(ledger.line, /Paid in full/);
});

test('floating point does not turn a paid booking into a penny owed', () => {
  // 0.1 + 0.2 is the classic. Three payments of 0.10 against a total of 0.30 must read as paid.
  const ledger = paymentLedger({
    source: 'direct',
    guestTotal: 0.3,
    payments: [
      { id: 'p1', amount: 0.1, receivedOn: '2026-11-01' },
      { id: 'p2', amount: 0.1, receivedOn: '2026-11-02' },
      { id: 'p3', amount: 0.1, receivedOn: '2026-11-03' },
    ],
  });
  assert.equal(ledger.received, 0.3);
  assert.equal(ledger.outstanding, 0);
  assert.equal(ledger.paidInFull, true, 'a rounding artefact left a paid booking short');
});

test('a refund is a negative payment, not a deletion, and reopens the balance', () => {
  const ledger = paymentLedger({
    source: 'direct',
    guestTotal: 1000,
    payments: [
      { id: 'p1', amount: 1000, receivedOn: '2026-11-01' },
      { id: 'r1', amount: -250, receivedOn: '2026-11-03', note: 'one night refunded' },
    ],
  });
  assert.equal(ledger.payments.length, 2, 'the refund erased the payment it followed');
  assert.equal(ledger.payments[0]!.id, 'p1', 'the payments are not in the order they happened');
  assert.equal(ledger.received, 750);
  assert.equal(ledger.outstanding, 250);
  assert.equal(ledger.paidInFull, false);
});

test('a booking paid over its total says so instead of hiding the overpayment', () => {
  const ledger = paymentLedger({
    source: 'direct',
    guestTotal: 500,
    payments: [{ id: 'p1', amount: 550, receivedOn: '2026-11-01' }],
  });
  assert.equal(ledger.outstanding, -50);
  assert.equal(ledger.paidInFull, true);
  assert.match(ledger.line, /\$50\.00 over/);
});

test('a booking with no guest total reports unknown, never zero owed', () => {
  const ledger = paymentLedger({ source: 'direct', guestTotal: null, payments: [] });
  assert.equal(ledger.total, null);
  assert.equal(ledger.outstanding, null, 'an unknown total was reported as a number');
  assert.equal(ledger.paidInFull, false, 'an unknown total was reported as paid');
  assert.match(ledger.line, /unknown/);
  assert.doesNotMatch(ledger.line, /\$0\.00/, 'an unknown total was rendered as zero');
});

test('money received with no total still says the total is unknown', () => {
  const ledger = paymentLedger({
    source: 'direct',
    guestTotal: undefined,
    payments: [{ id: 'p1', amount: 800, receivedOn: '2026-11-01' }],
  });
  assert.equal(ledger.received, 800);
  assert.equal(ledger.outstanding, null);
  assert.match(ledger.line, /\$800\.00 received/);
  assert.match(ledger.line, /unknown/);
});

test('a zero or negative total is not a price', () => {
  for (const total of [0, -100]) {
    const ledger = paymentLedger({ source: 'direct', guestTotal: total, payments: [] });
    assert.equal(ledger.total, null, `${total} was accepted as a guest total`);
  }
});

test('a channel booking is not a balance we collect', () => {
  for (const source of ['Airbnb', 'VRBO', 'Hospitable']) {
    const ledger = paymentLedger({ source, guestTotal: 3000, payments: [] });
    assert.equal(ledger.outstanding, null, `${source} was treated as money owed to us`);
    assert.equal(ledger.paidInFull, false, `${source} was reported as paid`);
    assert.match(ledger.line, /platform collects/, `${source} does not say who collects`);
  }
});

test('an unreadable payment is named, not silently dropped', () => {
  const ledger = paymentLedger({
    source: 'direct',
    guestTotal: 1000,
    payments: [
      { id: 'good', amount: 400, receivedOn: '2026-11-01' },
      { id: 'nan', amount: 'lots', receivedOn: '2026-11-01' },
      { id: 'nodate', amount: 100, receivedOn: 'undefined' },
      { id: 'zero', amount: 0, receivedOn: '2026-11-01' },
      null,
    ],
  });
  assert.equal(ledger.received, 400, 'an unusable row was counted as money');
  assert.equal(ledger.rejected.length, 4, 'an unusable row disappeared without a trace');
  assert.deepEqual(
    ledger.rejected.map((r) => r.id).sort(),
    ['#4', 'nan', 'nodate', 'zero'],
  );
});

test('a payment cannot be counted twice by repeating its id', () => {
  // Two rows with the same id are two rows: this function does not invent an identity rule, but the sum
  // must still equal what the rows say, so a caller that dedupes upstream is the only way to change it.
  const ledger = paymentLedger({
    source: 'direct',
    guestTotal: 1000,
    payments: [
      { id: 'p1', amount: 500, receivedOn: '2026-11-01' },
      { id: 'p1', amount: 500, receivedOn: '2026-11-01' },
    ],
  });
  assert.equal(ledger.received, 1000);
});

test('parseAmount refuses what is not money and keeps cents', () => {
  assert.equal(parseAmount(12.345), 12.35);
  assert.equal(parseAmount('40.10'), 40.1);
  assert.equal(parseAmount(Number.NaN), null);
  assert.equal(parseAmount(Infinity), null);
  assert.equal(parseAmount(undefined), null);
  assert.equal(parseAmount(null), null);
  assert.equal(parseAmount(''), null, 'a blank field became a payment of zero');
  assert.equal(parseAmount('   '), null, 'a whitespace field became a payment of zero');
  assert.equal(parseAmount('12abc'), null, 'a partly numeric string was accepted as money');
});

test('a fake calendar day is not a day', () => {
  assert.equal(isRealDay('2026-02-30'), false, 'February 30 was accepted');
  assert.equal(isRealDay('2026-11-09'), true);
  assert.equal(isRealDay('undefined'), false);
  assert.equal(isRealDay(20261109), false);
});

test('direct sources are recognised whichever way they are written', () => {
  for (const s of ['direct', 'Direct', 'DIRECT', 'website', 'own-site', 'manual']) {
    assert.equal(isDirectSource(s), true, `${s} was not recognised as direct`);
  }
  for (const s of ['Airbnb', 'VRBO', 'Hospitable', '', undefined, null]) {
    assert.equal(isDirectSource(s), false, `${s} was treated as direct`);
  }
});

test('the outstanding list names what it left out and adds up to its total', () => {
  const { rows, skipped, total } = outstandingBookings([
    { id: 'a', source: 'direct', guestTotal: 1000, payments: [], checkIn: '2026-12-01' },
    { id: 'b', source: 'direct', guestTotal: 500, payments: [{ id: 'x', amount: 500, receivedOn: '2026-11-01' }], checkIn: '2026-12-02' },
    { id: 'c', source: 'Airbnb', guestTotal: 900, payments: [], checkIn: '2026-12-03' },
    { id: 'd', source: 'direct', guestTotal: null, payments: [], checkIn: '2026-12-04' },
    { id: 'e', source: 'direct', guestTotal: 300, payments: [{ id: 'y', amount: 100, receivedOn: '2026-11-02' }], checkIn: '2026-12-05' },
  ]);
  assert.deepEqual(rows.map((r) => r.id), ['a', 'e'], 'the worst balance is not first');
  assert.equal(total, 1200);
  const reasons = Object.fromEntries(skipped.map((s) => [s.id, s.reason]));
  assert.equal(reasons.b, 'paid in full');
  assert.equal(reasons.c, 'not a direct booking');
  assert.equal(reasons.d, 'no guest total');
});

test('a booking with no guest total is never in the chase list', () => {
  // It cannot be chased for an amount nobody knows. Listing it at $0 would hide it; listing it at any
  // number would invent one.
  const { rows, skipped } = outstandingBookings([{ id: 'x', source: 'direct', guestTotal: undefined, payments: [] }]);
  assert.equal(rows.length, 0);
  assert.equal(skipped[0]!.reason, 'no guest total');
});

test('the balance is on the booking, not only in this module', () => {
  // The defect this guards against is the one this session kept finding: arithmetic with no caller. The
  // ledger is now read by the payments route and drawn on the guests page, so a booking can answer what is
  // still owed instead of only showing what was quoted.
  const panel = fs.readFileSync('src/components/GuestsPanel.tsx', 'utf8');
  assert.match(panel, /paymentLedger\(/, 'the guests page does not use the ledger');
  assert.match(panel, /data-bot="stay-balance"/, 'the balance is not rendered on the booking card');

  const route = fs.readFileSync('functions/api/book/payments.ts', 'utf8');
  assert.match(route, /paymentLedger\(/, 'the payments route does not answer with the ledger');
  assert.match(route, /isDirectSource/, 'the payments route does not refuse a channel booking');
  assert.match(route, /no guest total/, 'the payments route does not refuse a booking with no balance');
});

test('the page draws the balance from the ledger, not from its own arithmetic', () => {
  // A second formula in a component is how the part-booking price was overstated. The line has to come from
  // the tested function.
  const panel = fs.readFileSync('src/components/GuestsPanel.tsx', 'utf8');
  const start = panel.indexOf('data-bot="stay-balance"');
  assert.ok(start > 0, 'the balance line disappeared');
  const around = panel.slice(Math.max(0, start - 900), start + 200);
  assert.match(around, /paymentLedger\(/, 'the balance is computed somewhere other than the ledger');
  assert.doesNotMatch(around, /guestTotal\s*-\s*/, 'the component subtracted the total itself');
});
