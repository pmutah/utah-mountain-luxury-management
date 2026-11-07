import assert from 'node:assert/strict';
import test from 'node:test';
import { quoteShareButton, quoteShareLine, readStayLink, stayLinkSearch } from './stay-link.ts';

test('a stay link restores the house, dates, and party', () => {
  const link = readStayLink('?house=ranch&in=2026-11-04&out=2026-11-05&guests=6');
  assert.deepEqual(link, { house: 'ranch', checkIn: '2026-11-04', checkOut: '2026-11-05', guests: '6' });
  assert.equal(stayLinkSearch({ house: 'ranch', checkIn: '2026-11-04', checkOut: '2026-11-05', guests: '6' }), '?house=ranch&in=2026-11-04&out=2026-11-05&guests=6');
});

test('a stay link drops a name, a bad house, and a reversed stay', () => {
  const link = readStayLink('?house=hotel&in=2026-11-08&out=2026-11-06&guests=no&name=Ada&email=ada@example.com');
  assert.deepEqual(link, {});
  assert.equal(stayLinkSearch({ house: 'river', checkIn: '2026-11-06', checkOut: '2026-11-08', guests: '' }).includes('name'), false);
  assert.equal(stayLinkSearch({ house: 'river', checkIn: '2026-11-06', checkOut: '2026-11-08', guests: '' }).includes('guests'), false);
});

test('a stay link keeps the add-ons and drops a name', () => {
  const link = readStayLink('?house=river&in=2026-11-06&out=2026-11-08&addons=late,nope,early,early&name=Ada&email=ada@example.com');
  assert.deepEqual(link.addons, ['early', 'late']);
  assert.equal(JSON.stringify(link).includes('Ada'), false);
  const search = stayLinkSearch({
    house: 'river',
    checkIn: '2026-11-06',
    checkOut: '2026-11-08',
    guests: '',
    addons: ['groceries', 'early'],
  });
  assert.equal(search, '?house=river&in=2026-11-06&out=2026-11-08&addons=early%2Cgroceries');
  assert.equal(search.includes('name'), false);
});

test('a stay link keeps an arrival time and drops a made-up one', () => {
  const link = readStayLink('?house=ranch&in=2026-11-04&out=2026-11-05&arrive=6%3A00%20PM&name=Ada');
  assert.equal(link.arrive, '6:00 PM');
  assert.equal(JSON.stringify(link).includes('Ada'), false);
  assert.equal(readStayLink('?house=ranch&in=2026-11-04&out=2026-11-05&arrive=noon').arrive, undefined);
  const search = stayLinkSearch({
    house: 'ranch',
    checkIn: '2026-11-04',
    checkOut: '2026-11-05',
    guests: '4',
    arrive: '6:00 PM',
  });
  assert.equal(search, '?house=ranch&in=2026-11-04&out=2026-11-05&guests=4&arrive=6%3A00+PM');
});

test('a stay link keeps how many guests are children', () => {
  const link = readStayLink('?house=ranch&in=2026-11-04&out=2026-11-05&guests=4&children=1&name=Ada');
  assert.equal(link.children, '1');
  assert.equal(JSON.stringify(link).includes('Ada'), false);
  assert.equal(readStayLink('?house=ranch&in=2026-11-04&out=2026-11-05&children=no').children, undefined);
  assert.equal(
    stayLinkSearch({ house: 'ranch', checkIn: '2026-11-04', checkOut: '2026-11-05', guests: '4', children: '1' }),
    '?house=ranch&in=2026-11-04&out=2026-11-05&guests=4&children=1',
  );
});

test('a stay link keeps a leave time and turns 2:00 PM into the late add-on', () => {
  const midday = readStayLink('?house=ranch&in=2026-11-04&out=2026-11-05&leave=11%3A00%20AM&name=Ada');
  assert.equal(midday.leave, '11:00 AM');
  assert.equal(JSON.stringify(midday).includes('Ada'), false);
  const later = readStayLink('?house=ranch&in=2026-11-04&out=2026-11-05&leave=2%3A00%20PM');
  assert.equal(later.leave, '2:00 PM');
  assert.deepEqual(later.addons, ['late']);
  assert.equal(readStayLink('?leave=noon').leave, undefined);
  const contradicted = readStayLink('?house=ranch&in=2026-11-04&out=2026-11-05&addons=late,early&leave=11%3A00%20AM');
  assert.equal(contradicted.leave, '11:00 AM');
  assert.deepEqual(contradicted.addons, ['early']);
  assert.equal(
    stayLinkSearch({
      house: 'ranch',
      checkIn: '2026-11-04',
      checkOut: '2026-11-05',
      guests: '4',
      leave: '11:00 AM',
    }),
    '?house=ranch&in=2026-11-04&out=2026-11-05&guests=4&leave=11%3A00+AM',
  );
});

test('a stay link keeps a party or event mark and drops a name', () => {
  const link = readStayLink('?house=river&in=2026-11-03&out=2026-11-05&guests=4&event=1&name=Ada');
  assert.equal(link.event, true);
  assert.equal(JSON.stringify(link).includes('Ada'), false);
  assert.equal(readStayLink('?house=river&in=2026-11-03&out=2026-11-05&event=yes').event, undefined);
  const search = stayLinkSearch({
    house: 'river',
    checkIn: '2026-11-03',
    checkOut: '2026-11-05',
    guests: '4',
    event: true,
  });
  assert.equal(search, '?house=river&in=2026-11-03&out=2026-11-05&guests=4&event=1');
  assert.equal(
    stayLinkSearch({ house: 'river', checkIn: '2026-11-03', checkOut: '2026-11-05', guests: '4' }).includes('event'),
    false,
  );
});

test('an impossible calendar day is left off the link', () => {
  const link = readStayLink('?house=lindon&in=2026-02-31&out=2026-03-02&guests=4');
  assert.equal(link.house, 'lindon');
  assert.equal(link.checkIn, undefined);
  assert.equal(link.guests, '4');
});

test('a stay this page cannot quote is not called a quote on the share line', () => {
  const held = quoteShareLine(false);
  assert.match(held, /This stay is not quoted/);
  assert.equal(held.includes('reopens the quote'), false);
  assert.equal(held.includes('$'), false);
  assert.equal(/\bis open\b/.test(held), false);
  assert.equal(quoteShareButton(false), 'Copy this link');
  const named = quoteShareLine(false, 'Add the number of overnight guests. Nothing is sent.');
  assert.match(named, /Add the number of overnight guests/);
  assert.equal(named.includes('This stay is not quoted'), false);
  assert.match(named, /Nothing is sent/);
  const refused = quoteShareLine(false, 'This stay needs at least 5 nights. Nothing is sent.');
  assert.match(refused, /at least 5 nights/);
  assert.equal(quoteShareLine(false, 'Preview $9. Nothing is sent.').includes('$'), false);
  const ready = quoteShareLine(true);
  assert.match(ready, /reopens the quote/);
  assert.match(ready, /does not send a request/);
  assert.equal(quoteShareButton(true), 'Copy quote link');
});
