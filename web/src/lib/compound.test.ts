import assert from 'node:assert/strict';
import test from 'node:test';
import { bothHouseLengthNote, bothHouseLengths, bothHouseMonthNights, bothHouseMonthNote, bothHouseQuote, bothHouseRequestNote, compoundAgreementHold, compoundOffer, compoundPaperHold, compoundRequestNote, compoundRequestReady, compoundShownPaper, compoundShownTotal, compoundSplitLine, housePageCalendar } from './compound.ts';
import { checkInHold, checkoutStopLine, heldCheckout, monthDays } from './stay-calendar.ts';
import { agreementTopics } from './stay-agreement.ts';
import { MAX_DAILY_MOVE } from './market/rate-sheet.ts';
import { nightAsk } from './market/rates.ts';
import { quoteStay } from './quote.ts';

const pace = () => 'unknown' as const;
const open = {
  checkIn: '2026-11-01',
  checkOut: '2026-11-03',
  asOf: '2026-10-30',
};

test('the paper names both houses before the calendar can be read', () => {
  const lines = compoundPaperHold(30);
  assert.match(lines.join(' '), /22 stay at the River House/);
  // The Ranch takes the rest of the party once the River is full at 22.
  assert.match(lines.join(' '), /8 stay at the Ranch House/);
  assert.match(lines.join(' '), /does not hold either house/);
  assert.match(lines.join(' '), /does not say either house is open/);
  assert.equal(lines.join(' ').includes('$'), false);
  assert.match(compoundSplitLine(30), /22 stay at the River House and 8 stay at the Ranch House/);
  assert.equal(/\bis open\b/.test(compoundSplitLine(30)), false);
  assert.equal(compoundSplitLine(20), '');
  assert.equal(compoundPaperHold(20).length, 0);
  assert.equal(compoundPaperHold(46).length, 0);
  assert.equal(compoundPaperHold(30, 30).length, 0);
});

test('a two-house month marks a night booked at either house', () => {
  const nights = bothHouseMonthNights(
    { ranch: ['2026-12-18'], river: ['2026-12-10'], lindon: ['2026-12-01'] },
    { ranch: ['2026-12-02'], lindon: ['2026-12-03'] },
  );
  assert.deepEqual(nights.taken, ['2026-12-10', '2026-12-18']);
  assert.deepEqual(nights.closed, ['2026-12-02']);
  const days = monthDays(
    '2026-12',
    'river',
    nights.taken,
    { checkIn: '2026-12-01', checkOut: '2026-12-04' },
    '2026-11-04',
    'unknown',
    nights.closed,
  );
  const day = (iso: string) => days.find((item) => item.iso === iso);
  assert.equal(day('2026-12-18')?.booked, true);
  assert.equal(day('2026-12-10')?.booked, true);
  assert.equal(day('2026-12-01')?.booked, false);
  assert.equal(day('2026-12-02')?.held, true);
  assert.equal(day('2026-12-02')?.booked, false);
  const note = bothHouseMonthNote();
  assert.equal(note.includes('$'), false);
  assert.equal(/\bis open\b/.test(note), false);
  assert.match(note, /River House or the Ranch House/);
});

test('a two-house date field stops on a night booked at either house', () => {
  assert.equal(bothHouseQuote(30), true);
  assert.equal(bothHouseQuote(4), false);
  assert.equal(bothHouseQuote(50), false);
  assert.equal(bothHouseQuote(null), false);
  const nights = bothHouseMonthNights(
    { river: ['2026-12-10'], ranch: ['2026-12-18'], lindon: ['2026-12-08'] },
    {},
  );
  assert.equal(heldCheckout('2026-12-01', '2026-12-20', 'river', nights.taken, nights.closed), '2026-12-10');
  assert.equal(checkInHold('2026-12-18', 'river', nights.taken, nights.closed, '2026-11-04'), 'Those nights are already booked.');
  assert.equal(checkInHold('2026-12-18', 'river', ['2026-12-10'], [], '2026-11-04'), null);
  assert.equal(heldCheckout('2026-12-01', '2026-12-09', 'river', ['2026-12-10'], []), '2026-12-09');
  const stop = checkoutStopLine('2026-12-01', 'river', nights.taken, nights.closed) ?? '';
  assert.match(stop, /Checkout can be Dec 10/);
  assert.match(stop, /booked night/);
  assert.equal(stop.includes('$'), false);
  assert.equal(/\bis open\b/.test(stop), false);
});

test('a house page marks a night booked at either house when the party needs both', () => {
  const taken = { ranch: ['2026-12-18'], river: ['2026-12-10'], lindon: ['2026-12-01'] };
  const closed = { ranch: ['2026-12-02'], lindon: ['2026-12-08'] };
  const both = housePageCalendar('lindon', 30, true, taken, closed);
  assert.equal(both.both, true);
  assert.equal(both.house, 'river');
  assert.deepEqual(both.taken, ['2026-12-10', '2026-12-18']);
  assert.deepEqual(both.closed, ['2026-12-02']);
  assert.equal(both.taken.includes('2026-12-01'), false);
  assert.equal(both.closed.includes('2026-12-08'), false);
  const one = housePageCalendar('river', 4, true, taken, closed);
  assert.equal(one.both, false);
  assert.equal(one.house, 'river');
  assert.deepEqual(one.taken, ['2026-12-10']);
  assert.equal(one.taken.includes('2026-12-18'), false);
  const waiting = housePageCalendar('ranch', 30, false, taken, closed);
  assert.equal(waiting.both, false);
  assert.equal(waiting.house, 'ranch');
  assert.equal(JSON.stringify({ both, one }).includes('$'), false);
});

test('a party that fits one house does not get a two-house quote', () => {
  const offer = compoundOffer(open.checkIn, open.checkOut, 20, 0, {}, open.asOf, pace);
  assert.equal(offer.show, false);
});

test('Ranch and River together quote a party neither house can take alone', () => {
  const offer = compoundOffer(open.checkIn, open.checkOut, 30, 6, {}, open.asOf, pace);
  assert.equal(offer.show, true);
  assert.equal(offer.ok, true);
  if (!offer.ok || !offer.show) return;
  const river = quoteStay('river', open.checkIn, open.checkOut, [], {
    asOf: open.asOf,
    pace: 'unknown',
    guests: 22,
    children: 2,
  });
  const ranch = quoteStay('ranch', open.checkIn, open.checkOut, [], {
    asOf: open.asOf,
    pace: 'unknown',
    guests: 8,
    children: 4,
  });
  assert.equal(river.ok, true);
  assert.equal(ranch.ok, true);
  assert.equal(offer.total, river.stayTotal + ranch.stayTotal);
  assert.equal(offer.nights, 2);
  assert.equal(offer.riverGuests, 22);
  assert.equal(offer.ranchGuests, 8);
  assert.match(offer.line, /22 stay at the River House and 8 stay at the Ranch House, including 6 children/);
  assert.match(offer.line, /Nothing is sent/);
  assert.equal(offer.line.includes('$'), false);
  assert.equal(offer.line.includes('20% off'), false);
  assert.match(offer.paper[0] ?? '', /Ranch and River together/);
  assert.match(offer.paper.join(' '), /does not hold either house/);
  assert.equal(compoundShownTotal(offer, false), null);
  assert.deepEqual(compoundShownPaper(offer, false), []);
  assert.match(compoundShownTotal(offer, true) ?? '', /\$/);
  assert.match(compoundShownPaper(offer, true).join(' '), /\$/);
});

test('a party past both houses, a children-only party, and a booked house stay closed', () => {
  const tooBig = compoundOffer(open.checkIn, open.checkOut, 46, 0, {}, open.asOf, pace);
  assert.equal(tooBig.show, true);
  assert.equal(tooBig.ok, false);
  if (tooBig.ok || !tooBig.show) return;
  assert.match(tooBig.reason, /sleep 42/);
  assert.equal(tooBig.reason.includes('$'), false);

  const kids = compoundOffer(open.checkIn, open.checkOut, 30, 30, {}, open.asOf, pace);
  assert.equal(kids.ok, false);
  if (kids.ok || !kids.show) return;
  assert.match(kids.reason, /adult/);
  assert.equal(kids.reason.includes('$'), false);

  const oneAdult = compoundOffer(open.checkIn, open.checkOut, 30, 29, {}, open.asOf, pace);
  assert.equal(oneAdult.ok, false);
  if (oneAdult.ok || !oneAdult.show) return;
  assert.match(oneAdult.reason, /each house/);

  const booked = compoundOffer(open.checkIn, open.checkOut, 30, 0, { ranch: ['2026-11-01'] }, open.asOf, pace);
  assert.equal(booked.ok, false);
  if (booked.ok || !booked.show) return;
  assert.match(booked.reason, /Ranch: Those nights are already booked/);
  assert.equal(booked.paper.some((line) => line.includes('$')), false);
  const agreement = compoundAgreementHold();
  assert.match(agreement, /both houses can be quoted/);
  const named = compoundAgreementHold('River: This stay needs at least 5 nights. Nothing is sent.');
  assert.match(named, /at least 5 nights/);
  assert.match(named, /stay agreement stays off until then/);
  assert.equal(named.includes('both houses can be quoted'), false);
  assert.equal(compoundAgreementHold('Preview $9. Nothing is sent.').includes('$'), false);
  assert.match(agreement, /Nothing is sent/);
  assert.equal(agreement.includes('$'), false);
  assert.equal(/\bis open\b/.test(agreement), false);
});

test('a discounted night on both houses says 20% off', () => {
  const short = () => 'short' as const;
  const offer = compoundOffer('2026-11-06', '2026-11-08', 30, 0, {}, '2026-10-31', short);
  assert.equal(offer.show, true);
  assert.equal(offer.ok, true);
  if (!offer.ok || !offer.show) return;
  assert.match(offer.line, /nights are 20% off/);
  assert.equal(/\bfill\b|published base/.test(offer.line), false);
  assert.equal(offer.line.includes('$'), false);
  assert.match(offer.paper.join(' '), /20% off/);
  const far = compoundOffer('2026-12-01', '2026-12-03', 30, 0, {}, '2026-10-31', short);
  assert.equal(far.ok, true);
  if (!far.ok || !far.show) return;
  assert.equal(far.line.includes('20% off'), false);
  const booked = compoundOffer('2026-11-06', '2026-11-08', 30, 0, { ranch: ['2026-11-06'] }, '2026-10-31', short);
  assert.equal(booked.ok, false);
  if (booked.ok || !booked.show) return;
  assert.equal(booked.reason.includes('20% off'), false);
});

test('a two-house request waits for both agreements and does not hold the dates', () => {
  const river = agreementTopics('river').map((topic) => topic.id);
  const ranch = agreementTopics('ranch').map((topic) => topic.id);
  const ready = {
    offerOk: true,
    calendarLive: true,
    rulesRead: true,
    event: false,
    riverTopics: river,
    ranchTopics: ranch,
  };
  assert.equal(compoundRequestReady(ready), true);
  assert.equal(compoundRequestReady({ ...ready, ranchTopics: [] }), false);
  assert.equal(compoundRequestReady({ ...ready, calendarLive: false }), false);
  assert.equal(compoundRequestReady({ ...ready, event: true }), false);
  const note = compoundRequestNote(
    '22 stay at the River House and 8 stay at the Ranch House. Each house keeps an adult. Nothing is sent.',
  );
  assert.match(note, /Both houses are one request/);
  assert.match(note, /Nothing is held and nothing is charged yet/);
  assert.equal(note.includes('$'), false);
});

test('a two-house length stops on a night booked at either house', () => {
  const taken = { river: ['2026-12-10'], ranch: ['2026-12-18'], lindon: ['2026-12-02'] };
  const lengths = bothHouseLengths('2026-12-01', 30, 0, taken, {}, '2026-11-04', pace);
  assert.ok(lengths);
  assert.deepEqual(
    lengths.choices.map((choice) => choice.nights),
    [2, 3, 4, 5, 7, 9],
  );
  assert.equal(lengths.choices.at(-1)?.checkOut, '2026-12-10');
  assert.match(lengths.through, /December 10, 2026/);
  assert.equal(JSON.stringify(lengths).includes('$'), false);
  assert.match(bothHouseLengthNote(lengths.through), /Both houses can quote/);
  assert.equal(/\bis open\b/.test(bothHouseLengthNote(lengths.through)), false);
  const ranchBlock = bothHouseLengths('2026-12-01', 30, 0, { ranch: ['2026-12-05'] }, {}, '2026-11-04', pace);
  assert.deepEqual(ranchBlock?.choices.map((choice) => choice.nights), [2, 3, 4]);
  assert.equal(ranchBlock?.choices.at(-1)?.checkOut, '2026-12-05');
  assert.equal(bothHouseLengths('2026-12-01', 4, 0, taken, {}, '2026-11-04', pace), null);
  assert.equal(bothHouseLengths('2026-12-01', 30, 30, taken, {}, '2026-11-04', pace), null);
  assert.equal(bothHouseLengths('2026-12-20', 30, 0, { ranch: ['2026-12-23', '2026-12-24'] }, {}, '2026-11-04', pace), null);
});

test('a two-house request names both addresses and leaves the price off', () => {
  const note = bothHouseRequestNote();
  assert.match(note, /Vivian Park/);
  assert.match(note, /270 East Center Street/);
  assert.match(note, /Provo Canyon/);
  assert.match(note, /do not block neighbors/);
  assert.match(note, /Both houses are on this request/);
  assert.match(note, /Nothing is held/);
  assert.equal(note.includes('$'), false);
  assert.equal(/Harcliff|door\s*code|is open/i.test(note), false);
});

test('a two-house party is quoted the approved price, not the published card', () => {
  /*
   * `compoundOffer` called `quoteStay` without the approved sheet, so the largest booking on the site
   * was the one that ignored the host's pricing: a single-house guest paid the approved nightly rate
   * while a party sleeping in both houses paid the card. The two-house total is the number shown on
   * /book, so this was the most expensive place to be wrong.
   */
  const plain = compoundOffer(open.checkIn, open.checkOut, 30, 0, {}, open.asOf, pace);
  assert.equal(plain.ok, true);
  if (!plain.ok) return;

  // Approve the most a night can rise, so the difference is unambiguous. Both are nights inside the
  // stay: the checkout date is a morning, not a night, so approving it would price nothing.
  const riverAsk = nightAsk('river', open.checkIn);
  const ranchAsk = nightAsk('ranch', open.checkIn);
  const up = (ask: { guest: number }) => ask.guest + Math.round(ask.guest * MAX_DAILY_MOVE);

  const sheet = {
    river: [{ date: open.checkIn, guest: up(riverAsk) }],
    ranch: [{ date: open.checkIn, guest: up(ranchAsk) }],
  };
  const approved = compoundOffer(open.checkIn, open.checkOut, 30, 0, {}, open.asOf, pace, undefined, sheet);
  assert.equal(approved.ok, true);
  if (!approved.ok) return;

  assert.ok(
    approved.total > plain.total,
    'the two-house total ignored the approved raise, so both houses were quoted at the card',
  );
  // The contract is that a two-house party pays what each house would quote on its own, so the
  // figure is checked against the single-house quote rather than against guest-price arithmetic:
  // the total is host net, and the direct price is a share of the guest price.
  const riverSolo = quoteStay('river', open.checkIn, open.checkOut, [], {
    asOf: open.asOf,
    pace: 'unknown',
    guests: 22,
    children: 0,
    sheet: sheet.river,
  });
  const ranchSolo = quoteStay('ranch', open.checkIn, open.checkOut, [], {
    asOf: open.asOf,
    pace: 'unknown',
    guests: 8,
    children: 0,
    sheet: sheet.ranch,
  });
  assert.equal(riverSolo.ok, true);
  assert.equal(ranchSolo.ok, true);
  assert.equal(
    approved.total,
    riverSolo.stayTotal + ranchSolo.stayTotal,
    'the two-house total did not match what each house quotes on its own',
  );
  assert.equal(riverSolo.approvedNights, 1, 'the River night did not take the approved price');
  assert.equal(ranchSolo.approvedNights, 1, 'the Ranch night did not take the approved price');
});

test('a two-house quote with no approved sheet is unchanged', () => {
  const plain = compoundOffer(open.checkIn, open.checkOut, 30, 0, {}, open.asOf, pace);
  const empty = compoundOffer(open.checkIn, open.checkOut, 30, 0, {}, open.asOf, pace, undefined, {
    river: [],
    ranch: [],
  });
  assert.equal(plain.ok, true);
  assert.equal(empty.ok, true);
  if (!plain.ok || !empty.ok) return;
  assert.equal(empty.total, plain.total, 'an empty sheet moved the two-house price');
});
