import assert from 'node:assert/strict';
import test from 'node:test';
import { arrivalMinimum, checkInHold, checkoutCrosses, checkoutStopLine, heldCheckout, monthDays, monthNightLabel, pickStay, rateCardCell, rateCardDays, rateCardNote, stayMonthNote } from './stay-calendar.ts';
import { MAX_DAILY_MOVE } from './market/rate-sheet.ts';
import { nightAsk } from './market/rates.ts';
import { quoteStay } from './quote.ts';
import { AIRBNB_KEEP } from './revenue-goals.ts';

const open = { checkIn: '2026-11-06', checkOut: '2026-11-08' };

test('a booked night cannot start a stay, and a clear range can end on a booked morning', () => {
  const taken = ['2026-12-10', '2026-12-11', '2026-12-12'];
  const blocked = pickStay({ checkIn: '', checkOut: '' }, '2026-12-10', taken, 'river', '2026-10-29');
  assert.equal(blocked.checkIn, '');

  const started = pickStay({ checkIn: '', checkOut: '' }, '2026-12-08', taken, 'river', '2026-10-29');
  const finished = pickStay(started, '2026-12-10', taken, 'river', '2026-10-29');
  assert.deepEqual(finished, { checkIn: '2026-12-08', checkOut: '2026-12-10' });

  const across = pickStay(started, '2026-12-14', taken, 'river', '2026-10-29');
  assert.equal(across.checkOut, '');
  assert.equal(checkoutCrosses('2026-12-08', '2026-12-10', 'river', taken), false);
  assert.equal(checkoutCrosses('2026-12-08', '2026-12-14', 'river', taken), true);
  assert.equal(checkoutCrosses('2026-11-03', '2026-11-04', 'lindon', [], ['2026-11-04']), false);
  assert.equal(checkoutCrosses('2026-11-03', '2026-11-06', 'lindon', [], ['2026-11-04']), true);
  const bookedStop = checkoutStopLine('2026-11-16', 'ranch', ['2026-11-25', '2026-11-26']);
  assert.match(bookedStop ?? '', /Checkout can be Nov 25/);
  assert.match(bookedStop ?? '', /booked night/);
  assert.doesNotMatch(bookedStop ?? '', /\$|\bopen\b/i);
  const closedStop = checkoutStopLine('2026-11-02', 'lindon', [], ['2026-11-04']);
  assert.match(closedStop ?? '', /Checkout can be Nov 4/);
  assert.match(closedStop ?? '', /closed night/);
  assert.doesNotMatch(closedStop ?? '', /booked/);
  const both = checkoutStopLine('2026-11-02', 'lindon', ['2026-11-04'], ['2026-11-04']);
  assert.match(both ?? '', /closed night/);
  assert.equal(checkoutStopLine('2026-11-16', 'ranch', []), null);
  assert.equal(checkoutStopLine('2026-11-25', 'ranch', ['2026-11-25']), null);
  const ranchTaken = ['2026-11-25', '2026-11-26'];
  assert.equal(heldCheckout('2026-11-16', '2026-11-26', 'ranch', ranchTaken), '2026-11-25');
  assert.equal(heldCheckout('2026-11-16', '2026-11-18', 'ranch', ranchTaken), '2026-11-18');
  assert.equal(heldCheckout('2026-11-16', '2026-11-25', 'ranch', ranchTaken), '2026-11-25');
  assert.equal(heldCheckout('2026-11-02', '2026-11-06', 'lindon', [], ['2026-11-04']), '2026-11-04');
  assert.equal(checkInHold('2026-11-25', 'ranch', ['2026-11-25'], [], '2026-10-31'), 'Those nights are already booked.');
  assert.equal(checkInHold('2026-11-16', 'ranch', ['2026-11-25'], [], '2026-10-31'), null);
  assert.equal(checkInHold('2026-11-04', 'lindon', ['2026-11-04'], ['2026-11-04'], '2026-10-31'), 'Those nights are closed on the calendar.');
  assert.equal(checkInHold('2026-10-30', 'ranch', [], [], '2026-10-31'), 'That check-in has already passed.');
  assert.match(checkInHold('2026-10-31', 'river', [], [], '2026-10-31') ?? '', /first stays/);
  assert.equal(checkInHold('2026-11-19', 'river', ['2026-11-20'], [], '2026-10-29'), 'That night cannot start a stay.');

  const tooShort = ['2026-11-20'];
  const cannotStart = pickStay({ checkIn: '', checkOut: '' }, '2026-11-19', tooShort, 'river', '2026-10-29');
  assert.equal(cannotStart.checkIn, '');
  const before = pickStay({ checkIn: '', checkOut: '' }, '2026-11-18', tooShort, 'river', '2026-10-29');
  const leaveOnBookedMorning = pickStay(before, '2026-11-20', tooShort, 'river', '2026-10-29');
  assert.deepEqual(leaveOnBookedMorning, { checkIn: '2026-11-18', checkOut: '2026-11-20' });
  const later = pickStay({ checkIn: '', checkOut: '' }, '2026-11-21', tooShort, 'river', '2026-10-29');
  const keepLater = pickStay(later, '2026-11-19', tooShort, 'river', '2026-10-29');
  assert.equal(keepLater.checkIn, '2026-11-21');
  assert.equal(keepLater.checkOut, '');
});

test('the month marks booked nights and the nights inside the stay', () => {
  const days = monthDays('2026-11', 'river', ['2026-11-20'], open, '2026-10-29');
  const sixth = days.find((day) => day.iso === '2026-11-06');
  const seventh = days.find((day) => day.iso === '2026-11-07');
  const eighth = days.find((day) => day.iso === '2026-11-08');
  const twentieth = days.find((day) => day.iso === '2026-11-20');
  assert.equal(sixth?.isCheckIn, true);
  assert.equal(sixth?.inStay, true);
  assert.equal(sixth?.guest, 2486);
  assert.equal(sixth?.direct, 2100);
  assert.equal(seventh?.inStay, true);
  assert.equal(eighth?.isCheckOut, true);
  assert.equal(eighth?.inStay, false);
  assert.equal(twentieth?.booked, true);
  assert.equal(twentieth?.held, false);
  const block = monthDays('2026-11', 'lindon', ['2026-11-04'], { checkIn: '', checkOut: '' }, '2026-10-29', 'unknown', ['2026-11-04']).find(
    (day) => day.iso === '2026-11-04',
  );
  assert.equal(block?.booked, false);
  assert.equal(block?.held, true);
  assert.equal(block?.closed, false);
  const closedOnly = monthDays('2026-11', 'lindon', [], { checkIn: '', checkOut: '' }, '2026-10-29', 'unknown', ['2026-11-04']).find(
    (day) => day.iso === '2026-11-04',
  );
  assert.equal(closedOnly?.booked, false);
  assert.equal(closedOnly?.held, true);
  const closedCard = rateCardDays('2026-11', 'lindon', '2026-10-29', [], ['2026-11-04']).find((day) => day.iso === '2026-11-04');
  assert.equal(rateCardCell(closedCard!), 'Closed');
  const refusedStart = pickStay({ checkIn: '', checkOut: '' }, '2026-11-04', [], 'lindon', '2026-10-29', ['2026-11-04']);
  assert.equal(refusedStart.checkIn, '');
  const beforeClosed = pickStay({ checkIn: '', checkOut: '' }, '2026-11-03', [], 'lindon', '2026-10-29', ['2026-11-04']);
  const throughClosed = pickStay(beforeClosed, '2026-11-06', [], 'lindon', '2026-10-29', ['2026-11-04']);
  assert.equal(throughClosed.checkOut, '');
  assert.equal(sixth?.minNights, 2);
  assert.equal(sixth?.startNights, 2);
  assert.equal(twentieth?.startNights, null);
  const beforeBooked = days.find((day) => day.iso === '2026-11-19');
  assert.equal(beforeBooked?.startNights, null);
  const ranchFriday = monthDays('2026-11', 'ranch', [], { checkIn: '', checkOut: '' }, '2026-10-29').find((day) => day.iso === '2026-11-06');
  const ranchWeekday = monthDays('2026-11', 'ranch', [], { checkIn: '', checkOut: '' }, '2026-10-29').find((day) => day.iso === '2026-11-04');
  const ranchSoon = monthDays('2026-11', 'ranch', [], { checkIn: '', checkOut: '' }, '2026-11-01').find((day) => day.iso === '2026-11-06');
  assert.equal(ranchFriday?.minNights, 1);
  assert.equal(ranchFriday?.startNights, 2);
  assert.equal(ranchWeekday?.startNights, 1);
  assert.equal(ranchSoon?.startNights, 1);
  const holiday = monthDays('2026-11', 'river', [], open, '2026-10-29').find((day) => day.iso === '2026-11-24');
  assert.equal(holiday?.startNights, 4);
  const october = monthDays('2026-10', 'river', [], open, '2026-10-29').find((day) => day.iso === '2026-10-30');
  assert.equal(october?.closed, true);
  const peak = monthDays('2027-06', 'river', [], open, '2026-10-29').find((day) => day.iso === '2027-06-04');
  assert.equal(peak?.minNights, 4);
  assert.equal(arrivalMinimum('river', '2026-11-06'), 2);
  assert.equal(arrivalMinimum('river', '2026-10-30'), null);
  assert.equal(arrivalMinimum('lindon', '2026-11-04'), null);
});

test('the rate-card month has no price and does not say a night is booked', () => {
  const days = rateCardDays('2026-11', 'river', '2026-10-30');
  const before = rateCardDays('2026-10', 'river', '2026-10-30').find((day) => day.iso === '2026-10-30');
  const friday = days.find((day) => day.iso === '2026-11-13');
  assert.equal(before?.notYet, true);
  assert.equal(rateCardCell(friday!), '2 nights');
  const cells = days.map(rateCardCell).join('\n');
  assert.equal(cells.includes('$'), false);
  assert.equal(/\bbooked\b|\bopen\b/i.test(cells), false);
  assert.equal(rateCardNote().includes('$'), false);
  assert.match(rateCardNote(), /does not say which nights are booked or open/);
  assert.match(rateCardNote(), /Nothing is charged yet/);
  const marked = rateCardDays('2026-11', 'ranch', '2026-10-30', ['2026-11-25', '2026-11-20'], ['2026-11-20']);
  const booked = marked.find((day) => day.iso === '2026-11-25');
  const held = marked.find((day) => day.iso === '2026-11-20');
  const free = marked.find((day) => day.iso === '2026-11-16');
  assert.equal(booked?.booked, true);
  assert.equal(rateCardCell(booked!), 'Booked');
  assert.equal(held?.held, true);
  assert.equal(rateCardCell(held!), 'Closed');
  assert.equal(free?.booked, false);
  assert.equal(rateCardCell(free!).includes('$'), false);
  const discount = rateCardDays('2026-11', 'river', '2026-10-31', [], [], 'short').find((day) => day.iso === '2026-11-06');
  assert.equal(discount?.promo, true);
  assert.match(rateCardCell(discount!), /2 nights · 20% off/);
  assert.equal(rateCardCell(discount!).includes('$'), false);
  const decemberNight = rateCardDays('2026-12', 'river', '2026-10-31', [], [], 'short').find((day) => day.iso === '2026-12-20');
  assert.equal(decemberNight?.promo, false);
  assert.equal(rateCardCell(decemberNight!).includes('20% off'), false);
  const unread = rateCardDays('2026-11', 'river', '2026-10-31', null, null, 'short').find((day) => day.iso === '2026-11-06');
  assert.equal(unread?.promo, false);
  const takenNight = rateCardDays('2026-11', 'river', '2026-10-31', ['2026-11-06'], [], 'short').find((day) => day.iso === '2026-11-06');
  assert.equal(rateCardCell(takenNight!), 'Booked');
  assert.equal(rateCardCell(takenNight!).includes('20% off'), false);
  assert.match(rateCardNote(true), /Booked nights and calendar blocks are marked/);
  assert.equal(rateCardNote(true).includes('$'), false);
  assert.equal(/\bis open\b/.test(rateCardNote(true)), false);
  const heldNote = stayMonthNote(true, false);
  assert.match(heldNote, /This stay is not quoted/);
  assert.match(heldNote, /Nothing is sent/);
  assert.equal(heldNote.includes('Gold nights are the stay'), false);
  assert.equal(heldNote.includes('$'), false);
  assert.equal(/\bis open\b/.test(heldNote), false);
  assert.match(stayMonthNote(true, true), /Gold nights are the stay/);
  assert.match(stayMonthNote(false, false), /Choose the check-out morning/);
  const hidden = stayMonthNote(true, false, false);
  assert.match(hidden, /leaves the nightly price off/);
  assert.equal(hidden.includes('$'), false);
  const togetherMonth = stayMonthNote(true, true, false);
  assert.match(togetherMonth, /Gold nights are the stay/);
  assert.match(togetherMonth, /nightly price stays off/);
  assert.equal(togetherMonth.includes('This stay is not quoted'), false);
  assert.equal(togetherMonth.includes('$'), false);
  assert.equal(monthNightLabel('$1', 2, false), '2 nt');
  assert.equal(monthNightLabel('$1', 2, false).includes('$'), false);
  assert.equal(monthNightLabel('$1', 1, false), '');
  assert.equal(monthNightLabel('$1', 2, true), '$1 · 2 nt');
  assert.equal(monthNightLabel('$1', 2, true, true), '$1 · 20% off · 2 nt');
  assert.equal(monthNightLabel('$1', 2, false, true).includes('20%'), false);
  const discounted = monthDays('2026-11', 'river', [], { checkIn: '', checkOut: '' }, '2026-10-31', 'short');
  assert.equal(discounted.find((day) => day.iso === '2026-11-06')?.promo, true);
  const later = monthDays('2026-12', 'river', [], { checkIn: '', checkOut: '' }, '2026-10-31', 'short');
  assert.equal(later.find((day) => day.iso === '2026-12-20')?.promo, false);
  const bookedNight = monthDays('2026-11', 'river', ['2026-11-06'], { checkIn: '', checkOut: '' }, '2026-10-31', 'short');
  assert.equal(bookedNight.find((day) => day.iso === '2026-11-06')?.promo, false);
});

test('an approved night shows the same price in the grid as the quote', () => {
  const ask = nightAsk('river', '2026-12-07');
  const lifted = ask.guest + Math.round(ask.guest * MAX_DAILY_MOVE);
  const sheet = [{ date: '2026-12-07', guest: lifted }];

  // The live month grid and the quote both read the sheet, so a guest cannot see two prices.
  const grid = monthDays('2026-12', 'river', [], { checkIn: '2026-12-07', checkOut: '2026-12-09' }, '2026-11-07', 'short', [], sheet);
  const cell = grid.find((day) => day.iso === '2026-12-07');
  assert.equal(cell?.approved, true);
  assert.equal(cell?.direct, Math.round(lifted * AIRBNB_KEEP));

  const quote = quoteStay('river', '2026-12-07', '2026-12-09', [], { asOf: '2026-11-07', pace: 'short', sheet });
  assert.equal(quote.approvedNights, 1);
  assert.equal(quote.nights[0]!.direct, cell?.direct, 'the grid and the quote disagree on the approved night');
  // The next night has no approval, so it keeps the card and the promotion.
  assert.equal(quote.nights[1]!.approved, undefined);

  // A booked night keeps the card even when the sheet names it.
  const taken = monthDays('2026-12', 'river', ['2026-12-07'], { checkIn: '', checkOut: '' }, '2026-11-07', 'short', [], sheet);
  assert.equal(taken.find((day) => day.iso === '2026-12-07')?.approved, false);

  // A night with no sheet at all is not marked approved.
  const plain = monthDays('2026-12', 'river', [], { checkIn: '', checkOut: '' }, '2026-11-07', 'short');
  assert.equal(plain.find((day) => day.iso === '2026-12-07')?.approved, false);
  assert.equal(plain.find((day) => day.iso === '2026-12-07')?.direct, ask.host);
});
