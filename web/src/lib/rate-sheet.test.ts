/**
 * The approved-rate sheet is the only place a comp-driven price can reach a guest. These tests pin
 * the guards, because a bug here would quote a guest a price the host never approved, or a price
 * below the floor the business already set.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_DAILY_MOVE,
  MAX_SHEET_NIGHTS,
  PROMOTION_OFF,
  approvedGuestRate,
  sheetCovers,
  sheetFor,
  sheetLine,
  sheetUsable,
  toApprovedRate,
  withApprovedRate,
  withApprovedRateReport,
  withoutApprovedRate,
  type ApprovedRate,
} from './market/rate-sheet.ts';
import { quoteStay } from './quote.ts';
import { nightAsk } from './market/rates.ts';

const APPROVED_AT = '2026-11-07T12:00:00.000Z';

function row(over: Partial<ApprovedRate> = {}): ApprovedRate {
  return { house: 'ranch', date: '2026-12-01', guest: 660, approvedAt: APPROVED_AT, ...over };
}

test('a row with a bad date, no price, or no approval time is dropped', () => {
  assert.equal(toApprovedRate({ house: 'ranch', date: '2026-13-01', guest: 660, approvedAt: APPROVED_AT }), null);
  assert.equal(toApprovedRate({ house: 'ranch', date: '2026-12-01', guest: 0, approvedAt: APPROVED_AT }), null);
  assert.equal(toApprovedRate({ house: 'ranch', date: '2026-12-01', guest: 660 }), null);
  assert.equal(toApprovedRate({ house: '', date: '2026-12-01', guest: 660, approvedAt: APPROVED_AT }), null);
  assert.equal(toApprovedRate('nope'), null);
  assert.deepEqual(toApprovedRate(row()), row());
});

test('an unapproved night keeps the published card', () => {
  const ask = nightAsk('ranch', '2026-12-01');
  const base = { guest: ask.guest, floorGuest: ask.floorGuest };
  assert.equal(approvedGuestRate([], '2026-12-01', base), null);
  assert.equal(approvedGuestRate([{ date: '2026-12-02', guest: ask.guest }], '2026-12-01', base), null);
  assert.equal(approvedGuestRate([{ date: '2026-12-01', guest: ask.guest }], '2026-12-01', base), ask.guest);
});

test('a price under the floor or past the ceiling is not quoted', () => {
  const ask = nightAsk('ranch', '2026-12-01');
  const base = { guest: ask.guest, floorGuest: ask.floorGuest };
  assert.equal(approvedGuestRate([{ date: '2026-12-01', guest: 10 }], '2026-12-01', base), null, 'a below-floor price got through');
  assert.equal(
    approvedGuestRate([{ date: '2026-12-01', guest: Math.round(ask.guest * 3) }], '2026-12-01', base),
    null,
    'a price far over the card got through',
  );
});

test('a move past the daily cap is not quoted', () => {
  const ask = nightAsk('ranch', '2026-12-01');
  const base = { guest: ask.guest, floorGuest: ask.floorGuest };
  const cap = Math.round(ask.guest * MAX_DAILY_MOVE);
  assert.equal(approvedGuestRate([{ date: '2026-12-01', guest: ask.guest + cap + 1 }], '2026-12-01', base), null);
  assert.equal(approvedGuestRate([{ date: '2026-12-01', guest: ask.guest + cap }], '2026-12-01', base), ask.guest + cap);
});

test('a promotion is approvable but a deeper cut is not', () => {
  const ask = nightAsk('ranch', '2026-12-01');
  const base = { guest: ask.guest, floorGuest: ask.floorGuest };
  const promo = Math.max(Math.round(base.floorGuest), Math.round(ask.guest * (1 - PROMOTION_OFF)));
  assert.equal(approvedGuestRate([{ date: '2026-12-01', guest: promo }], '2026-12-01', base), promo);
  assert.equal(approvedGuestRate([{ date: '2026-12-01', guest: promo - 1 }], '2026-12-01', base), null);
});

test('a holiday or a booked night is never priced by the sheet', () => {
  assert.equal(sheetUsable('2026-12-01', {}), true);
  assert.equal(sheetUsable('2026-12-01', { paused: true }), false);
  assert.equal(sheetUsable('2026-12-01', { taken: ['2026-12-01'] }), false);
  assert.equal(sheetUsable('2026-12-01', { closed: ['2026-12-01'] }), false);
  assert.equal(sheetUsable('2026-12-01', { taken: ['2026-12-02'] }), true);
});

test('a second approval for one night replaces the first', () => {
  const once = withApprovedRate([], row({ guest: 660 }));
  const twice = withApprovedRate(once, row({ guest: 670 }));
  assert.equal(twice.length, 1, 'the sheet carried two answers for one night');
  assert.equal(twice[0]!.guest, 670);
});

test('clearing one night leaves the others and is safe to repeat', () => {
  const sheet = withApprovedRate(withApprovedRate([], row()), row({ date: '2026-12-02' }));
  const cleared = withoutApprovedRate(sheet, 'ranch', '2026-12-01');
  assert.equal(cleared.length, 1);
  assert.equal(cleared[0]!.date, '2026-12-02');
  assert.deepEqual(withoutApprovedRate(cleared, 'ranch', '2026-09-09'), cleared);
});

test('the sheet never grows past its cap', () => {
  let sheet: ApprovedRate[] = [];
  for (let i = 0; i < MAX_SHEET_NIGHTS + 20; i += 1) {
    const date = new Date(Date.UTC(2027, 0, 1 + i)).toISOString().slice(0, 10);
    sheet = withApprovedRate(sheet, row({ date }));
  }
  assert.equal(sheet.length, MAX_SHEET_NIGHTS);
});

test('the cap drops the furthest-out nights, not the ones a guest is about to book', () => {
  // The old truncation sorted by house first and kept the tail, so it kept next year and dropped
  // tonight. A near night is worth more than a far one, so trimming has to start at the far end.
  let sheet: ApprovedRate[] = [];
  for (let i = 0; i < MAX_SHEET_NIGHTS + 40; i += 1) {
    const date = new Date(Date.UTC(2027, 0, 1 + i)).toISOString().slice(0, 10);
    sheet = withApprovedRate(sheet, row({ date }));
  }
  assert.equal(sheet.some((r) => r.date === '2027-01-01'), true, 'the soonest night was dropped');
  assert.equal(sheet.some((r) => r.date === '2027-01-02'), true, 'a near night was dropped');
  const last = new Date(Date.UTC(2027, 0, 1 + MAX_SHEET_NIGHTS + 39)).toISOString().slice(0, 10);
  assert.equal(sheet.some((r) => r.date === last), false, 'the furthest night survived the cap');
});

test('a full sheet never erases a whole house', () => {
  // The bug this pins: with a house-first sort and a tail slice, `lindon` sorted to the front and
  // every Lindon approval vanished on the write that crossed the cap. Guests then quietly paid the
  // card price on 200 nights the host had priced, with nothing on the desk saying so.
  const houses = ['lindon', 'ranch', 'river'] as const;
  let sheet: ApprovedRate[] = [];
  const nights = Math.floor(MAX_SHEET_NIGHTS / houses.length) + 50;
  for (let i = 0; i < nights; i += 1) {
    const date = new Date(Date.UTC(2027, 0, 1 + i)).toISOString().slice(0, 10);
    for (const house of houses) sheet = withApprovedRate(sheet, row({ house, date }));
  }
  assert.equal(sheet.length, MAX_SHEET_NIGHTS);
  for (const house of houses) {
    const kept = sheet.filter((r) => r.house === house);
    assert.ok(kept.length > 0, `${house} lost every approved night`);
    assert.equal(kept[0]!.date, '2027-01-01', `${house} lost its soonest night`);
  }
  // The trim is spread evenly, because every house prices the same calendar.
  const counts = houses.map((house) => sheet.filter((r) => r.house === house).length);
  assert.ok(Math.max(...counts) - Math.min(...counts) <= 1, `the trim was lopsided: ${counts.join(', ')}`);
});

test('a write reports how many nights the cap evicted, so a drop is never silent', () => {
  let sheet: ApprovedRate[] = [];
  for (let i = 0; i < MAX_SHEET_NIGHTS; i += 1) {
    const date = new Date(Date.UTC(2027, 0, 1 + i)).toISOString().slice(0, 10);
    sheet = withApprovedRate(sheet, row({ date }));
  }
  const under = withApprovedRateReport(sheet, row({ date: '2027-01-01' }));
  assert.equal(under.dropped, 0, 'a write that fitted was reported as dropping a night');

  const over = withApprovedRateReport(sheet, row({ date: '2030-06-01' }));
  assert.equal(over.dropped, 1, 'the eviction was not reported');
  assert.equal(over.sheet.length, MAX_SHEET_NIGHTS);
  assert.equal(over.sheet.some((r) => r.date === '2030-06-01'), false, 'the cap kept the night it evicted to make room for');
});

test('sheetFor and sheetCovers read the house and the range', () => {
  const sheet = [row(), row({ date: '2026-12-05' }), row({ house: 'river' })];
  assert.deepEqual(sheetFor(sheet, 'ranch', '2026-12-01', '2026-12-02').map((r) => r.date), ['2026-12-01']);
  assert.equal(sheetCovers(sheet, 'ranch', '2026-12-04', '2026-12-06'), true);
  assert.equal(sheetCovers(sheet, 'ranch', '2026-12-06', '2026-12-09'), false);
  assert.equal(sheetCovers(sheet, 'lindon', '2026-12-01', '2026-12-31'), false);
});

test('the desk line counts approved nights and quotes no price', () => {
  const none = sheetLine([], 'ranch');
  assert.match(none, /published card/);
  assert.equal(none.includes('$'), false);
  const one = sheetLine([row()], 'ranch');
  assert.match(one, /1 night carries/);
  assert.equal(one.includes('$'), false);
  const two = sheetLine([row(), row({ date: '2026-12-02' })], 'ranch');
  assert.match(two, /2 nights carry/);
});

test('an approved night reaches the guest quote, and the rest keep the card', () => {
  const checkIn = '2026-12-01';
  const checkOut = '2026-12-04';
  const plain = quoteStay('ranch', checkIn, checkOut, [], { asOf: '2026-11-07' });
  assert.equal(plain.ok, true);
  assert.equal(plain.approvedNights, 0);

  const ask = nightAsk('ranch', checkIn);
  const lifted = ask.guest + Math.round(ask.guest * MAX_DAILY_MOVE);
  const sheet = [{ date: checkIn, guest: lifted }];
  const priced = quoteStay('ranch', checkIn, checkOut, [], { asOf: '2026-11-07', sheet });
  assert.equal(priced.ok, true);
  assert.equal(priced.approvedNights, 1, 'the approved night did not reach the quote');
  assert.equal(priced.nights[0]!.guest, lifted);
  assert.equal(priced.nights[0]!.approved, true);
  assert.equal(priced.nights[1]!.approved, undefined, 'a night with no approval was marked approved');
  // Direct lodging is host net, so it moves by the host share of the lift, not by the lift itself.
  assert.equal(priced.lodging, plain.lodging + (priced.nights[0]!.direct - plain.nights[0]!.direct));
  assert.ok(priced.lodging > plain.lodging, 'the approved night did not raise the lodging total');
});

test('an approved night takes no promotion and cannot undercut the floor', () => {
  const ask = nightAsk('ranch', '2026-12-01');
  const sheet = [{ date: '2026-12-01', guest: 1 }];
  const priced = quoteStay('ranch', '2026-12-01', '2026-12-03', [], { asOf: '2026-11-07', sheet });
  // A below-floor approval is refused, so the night keeps the card rather than the bad price.
  assert.equal(priced.approvedNights, 0);
  assert.equal(priced.nights[0]!.guest, ask.guest);
});

test('a booked night keeps its price even when a sheet names it', () => {
  const ask = nightAsk('ranch', '2026-12-01');
  const lifted = ask.guest + Math.round(ask.guest * MAX_DAILY_MOVE);
  const sheet = [{ date: '2026-12-01', guest: lifted }];
  const priced = quoteStay('ranch', '2026-12-01', '2026-12-03', ['2026-12-01'], { asOf: '2026-11-07', sheet });
  assert.equal(priced.ok, false);
  assert.equal(priced.approvedNights, 0, 'a booked night was priced by the sheet');
  assert.equal(priced.nights[0]!.guest, ask.guest);
});
