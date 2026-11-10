import assert from 'node:assert/strict';
import test from 'node:test';
import { houseOffers, housePageAside, houseStayAddon } from './house-offer.ts';

test('the house list says what each house is and does not say it is open', () => {
  const offers = houseOffers();
  assert.deepEqual(
    offers.map((row) => row.house),
    ['river', 'ranch', 'lindon'],
  );
  const text = JSON.stringify(offers);
  const river = offers[0].lines.join(' ');
  const ranch = offers[1].lines.join(' ');
  const lindon = offers[2].lines.join(' ');
  assert.match(river, /Vivian Park, Provo Canyon, Utah 84604/);
  assert.match(ranch, /270 East Center Street, Lindon, Utah 84042/);
  assert.match(lindon, /143 Harcliff Circle, Lindon, Utah 84042/);
  assert.match(river, /eight king suites/);
  assert.match(river, /Provo River/);
  assert.match(river, /rendering/);
  assert.match(river, /Canyon grocery drop/);
  assert.match(ranch, /Hot tub ready at arrival/);
  assert.equal(lindon.includes('Hot tub'), false);
  assert.match(lindon, /does not check a night/);
  assert.equal(lindon.includes('calendar can be read'), false);
  assert.match(river, /septic/i);
  assert.match(ranch, /Hot tub/i);
  assert.match(lindon, /near BYU/);
  assert.equal(text.includes('$'), false);
  assert.equal(/password|code\s*\d/i.test(text), false);
  assert.equal(text.toLowerCase().includes('will quote'), false);
  assert.equal(/\bis open\b/i.test(text), false);
});

test('a house page names the add-ons and the next event', () => {
  const river = housePageAside('river', '2026-10-30').join('\n');
  const ranch = housePageAside('ranch', '2026-10-30').join('\n');
  const lindon = housePageAside('lindon', '2026-10-30').join('\n');
  assert.match(river, /Canyon grocery drop/);
  assert.match(ranch, /Hot tub ready at arrival/);
  assert.equal(lindon.includes('Hot tub'), false);
  assert.match(river, /BYU at Utah/);
  assert.match(river, /2 nights/);
  assert.equal(river.includes('Arizona State'), false);
  assert.match(ranch, /BYU vs Arizona State/);
  assert.match(ranch, /1 night/);
  assert.match(river, /Nothing extra is added/);
  assert.match(river, /Nothing is charged yet/);
  const text = `${river}\n${ranch}\n${lindon}`;
  assert.equal(text.includes('$'), false);
  assert.equal(/\bis open\b/i.test(text), false);
});

test('a house page uses the calendar for an early arrival and a later checkout', () => {
  const clear = houseStayAddon('ranch', '2026-10-31', {
    checkIn: '2026-11-16',
    checkOut: '2026-11-18',
    taken: ['2026-11-25'],
  });
  assert.match(clear, /Hot tub ready at arrival/);
  assert.match(clear, /Arrive at 1:00 PM is a request/);
  assert.match(clear, /Leave at 2:00 PM is a request/);
  assert.equal(clear.includes('calendar can be read'), false);
  assert.equal(clear.includes('$'), false);
  assert.equal(/\bis open\b/i.test(clear), false);
  const booked = houseStayAddon('ranch', '2026-10-31', {
    checkIn: '2026-11-29',
    checkOut: '2026-12-01',
    taken: ['2026-11-28'],
  });
  assert.match(booked, /An early arrival is not open for this stay/);
  assert.match(booked, /Leave at 2:00 PM is a request/);
  const closed = houseStayAddon('lindon', '2026-10-31', {
    checkIn: '2026-11-16',
    checkOut: '2026-11-18',
    taken: [],
    closed: ['2026-11-15'],
  });
  assert.match(closed, /An early arrival is not open for this stay/);
  assert.equal(closed.includes('Hot tub'), false);
  const inside = houseStayAddon('ranch', '2026-10-31', {
    checkIn: '2026-11-25',
    checkOut: '2026-11-27',
    taken: ['2026-11-25', '2026-11-26'],
  });
  assert.match(inside, /Those nights are already booked/);
  assert.equal(inside.includes('Hot tub'), false);
  assert.equal(inside.includes('1:00 PM is a request'), false);
});

test('a house page for both houses follows both calendars', () => {
  const party = {
    guests: 30,
    taken: { ranch: ['2026-11-30'], river: [] as string[], lindon: ['2026-11-30'] },
    closed: {},
  };
  const early = houseStayAddon(
    'river',
    '2026-11-04',
    { checkIn: '2026-12-01', checkOut: '2026-12-04', taken: [] },
    party,
  );
  assert.match(early, /Canyon grocery drop/);
  assert.match(early, /A 1:00 PM arrival is not open for both houses/);
  assert.match(early, /Leave at 2:00 PM is a request for both houses/);
  assert.equal(/Arrive at 1:00 PM is a request/.test(early), false);
  assert.equal(early.includes('$'), false);
  assert.equal(/\bis open\b/.test(early), false);
  const one = houseStayAddon('river', '2026-11-04', {
    checkIn: '2026-12-01',
    checkOut: '2026-12-04',
    taken: [],
  });
  assert.match(one, /Arrive at 1:00 PM is a request/);
  assert.equal(/both houses/.test(one), false);
  const late = houseStayAddon(
    'ranch',
    '2026-11-04',
    { checkIn: '2026-12-01', checkOut: '2026-12-04', taken: [] },
    { guests: 30, taken: { river: ['2026-12-04'], ranch: [] } },
  );
  assert.match(late, /Arrive at 1:00 PM is a request for both houses/);
  assert.match(late, /A 2:00 PM leave is not open for both houses/);
  const booked = houseStayAddon(
    'river',
    '2026-11-04',
    { checkIn: '2026-12-01', checkOut: '2026-12-12', taken: [] },
    { guests: 30, taken: { river: ['2026-12-10'], ranch: [] } },
  );
  assert.match(booked, /already booked/);
  assert.equal(/1:00 PM is a request/.test(booked), false);
  assert.equal(booked.includes('$'), false);
  const aside = housePageAside(
    'river',
    '2026-11-04',
    { checkIn: '2026-12-01', checkOut: '2026-12-04', taken: [] },
    { guests: 30, taken: { ranch: ['2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28'] } },
  ).join('\n');
  assert.match(aside, /Next event both houses can quote/);
  assert.equal(aside.includes('Thanksgiving'), false);
  assert.equal(aside.includes('$'), false);
});

test('the house list follows the stay once the calendar is read', () => {
  const offers = houseOffers({
    checkIn: '2026-11-06',
    checkOut: '2026-11-08',
    asOf: '2026-10-31',
    taken: { river: [], ranch: [], lindon: ['2026-11-06'] },
    closed: { river: [], ranch: [], lindon: [] },
  });
  const river = offers.find((row) => row.house === 'river')!;
  const ranch = offers.find((row) => row.house === 'ranch')!;
  const lindon = offers.find((row) => row.house === 'lindon')!;
  assert.match(river.addon, /Arrive at 1:00 PM is a request/);
  assert.match(river.addon, /Leave at 2:00 PM is a request/);
  assert.match(ranch.addon, /Arrive at 1:00 PM is a request/);
  assert.match(lindon.addon, /already booked/);
  assert.equal(river.addon.includes('does not check a night'), false);
  assert.equal(river.lines.includes(river.addon), true);
  const earlyClosed = houseOffers({
    checkIn: '2026-11-29',
    checkOut: '2026-12-03',
    asOf: '2026-10-31',
    taken: { river: [], ranch: ['2026-11-28'], lindon: [] },
    closed: { river: [], ranch: [], lindon: [] },
  }).find((row) => row.house === 'ranch')!;
  assert.match(earlyClosed.addon, /An early arrival is not open for this stay/);
  assert.match(earlyClosed.addon, /Leave at 2:00 PM is a request/);
  const text = JSON.stringify(offers);
  assert.equal(text.includes('$'), false);
  assert.equal(/still opens the day before/i.test(text), false);
  assert.equal(/\bis open\b/i.test(text), false);
});

test('the house list follows both calendars when the party needs both houses', () => {
  const offers = houseOffers({
    checkIn: '2026-12-01',
    checkOut: '2026-12-04',
    asOf: '2026-11-04',
    guests: 30,
    taken: { ranch: ['2026-11-30'], river: [], lindon: ['2026-11-30'] },
    closed: {},
  });
  const river = offers.find((row) => row.house === 'river')!;
  assert.match(river.addon, /Canyon grocery drop/);
  assert.match(river.addon, /A 1:00 PM arrival is not open for both houses/);
  assert.match(river.addon, /Leave at 2:00 PM is a request for both houses/);
  assert.equal(river.addon.includes('$'), false);
  const one = houseOffers({
    checkIn: '2026-12-01',
    checkOut: '2026-12-04',
    asOf: '2026-11-04',
    guests: 4,
    taken: { ranch: ['2026-11-30'], river: [], lindon: [] },
    closed: {},
  }).find((row) => row.house === 'river')!;
  assert.match(one.addon, /Arrive at 1:00 PM is a request/);
  assert.equal(/both houses/.test(one.addon), false);
});
