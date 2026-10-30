import assert from 'node:assert/strict';
import test from 'node:test';
import { readStayLink, stayLinkSearch } from './stay-link.ts';

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

test('an impossible calendar day is left off the link', () => {
  const link = readStayLink('?house=lindon&in=2026-02-31&out=2026-03-02&guests=4');
  assert.equal(link.house, 'lindon');
  assert.equal(link.checkIn, undefined);
  assert.equal(link.guests, '4');
});
