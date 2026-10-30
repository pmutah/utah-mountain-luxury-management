import assert from 'node:assert/strict';
import test from 'node:test';
import { compoundOffer } from './compound.ts';
import { quoteStay } from './quote.ts';

const pace = () => 'unknown' as const;
const open = {
  checkIn: '2026-11-01',
  checkOut: '2026-11-03',
  asOf: '2026-10-30',
};

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
    guests: 25,
    children: 2,
  });
  const ranch = quoteStay('ranch', open.checkIn, open.checkOut, [], {
    asOf: open.asOf,
    pace: 'unknown',
    guests: 5,
    children: 4,
  });
  assert.equal(river.ok, true);
  assert.equal(ranch.ok, true);
  assert.equal(offer.total, river.stayTotal + ranch.stayTotal);
  assert.equal(offer.nights, 2);
  assert.equal(offer.riverGuests, 25);
  assert.equal(offer.ranchGuests, 5);
  assert.match(offer.line, /25 stay at the River House and 5 stay at the Ranch House, including 6 children/);
  assert.match(offer.line, /Nothing is sent/);
  assert.equal(offer.line.includes('$'), false);
  assert.match(offer.paper[0] ?? '', /Ranch and River together/);
  assert.match(offer.paper.join(' '), /does not hold either house/);
});

test('a party past both houses, a children-only party, and a booked house stay closed', () => {
  const tooBig = compoundOffer(open.checkIn, open.checkOut, 46, 0, {}, open.asOf, pace);
  assert.equal(tooBig.show, true);
  assert.equal(tooBig.ok, false);
  if (tooBig.ok || !tooBig.show) return;
  assert.match(tooBig.reason, /sleep 45/);
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
});
