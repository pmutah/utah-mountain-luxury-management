import assert from 'node:assert/strict';
import test from 'node:test';
import { guestRequestReceipt } from './booking-mail.ts';

/*
 * A guest who asked for the Garage Suite was sent "We have your request for The River House". That is the wrong house,
 * and the receipt is the guest's own record of what they asked for — so the mistake survives in their inbox even after
 * the site is corrected.
 *
 * The receipt still says "request, not a booking", names no price, and promises nothing. Only the thing being requested
 * changes.
 */

const base = {
  guestName: 'Ada Lovelace',
  houses: ['river'],
  checkIn: '2027-03-10',
  checkOut: '2027-03-12',
  nights: 2,
};

test('a whole-house request still reads as the house alone', () => {
  const mail = guestRequestReceipt(base);
  assert.match(mail.body, /your request for The River House,/);
  assert.equal(/at The River House/.test(mail.body), false, 'a whole-house receipt named a part');
});

test('a part request names the part, not just the house', () => {
  const mail = guestRequestReceipt({ ...base, units: ['garage-suite'] });
  assert.match(mail.body, /River Garage Suite at The River House/);
  // The bare house phrasing would be the wrong house on its own.
  assert.equal(/your request for The River House,/.test(mail.body), false, 'a part receipt still says only the house');
});

test('two parts are listed the way a person writes them', () => {
  const mail = guestRequestReceipt({ ...base, units: ['garage-suite', 'main-lodge'] });
  assert.match(mail.body, /River Garage Suite and River Main Lodge at The River House/);
});

test('three parts do not read as three "and"s', () => {
  const mail = guestRequestReceipt({ ...base, units: ['garage-suite', 'recreation-wing', 'main-lodge'] });
  assert.match(mail.body, /River Garage Suite, River Recreation Wing, and River Main Lodge/);
  assert.equal(/and River Recreation Wing and/.test(mail.body), false);
});

test('an empty unit list is the whole house, which is what every earlier request means', () => {
  const mail = guestRequestReceipt({ ...base, units: [] });
  assert.match(mail.body, /your request for The River House,/);
});

test('a part name we do not sell is shown as given rather than dropped', () => {
  // Dropping it would silently turn a part request into a whole-house one in the record.
  const mail = guestRequestReceipt({ ...base, units: ['attic'] });
  assert.match(mail.body, /attic at The River House/);
});

test('the receipt still says it is a request and not a booking', () => {
  for (const units of [undefined, ['garage-suite'], ['garage-suite', 'main-lodge']]) {
    const mail = guestRequestReceipt({ ...base, ...(units ? { units } : {}) });
    assert.match(mail.body, /This is a request, not a confirmed booking/);
  }
});

test('a part receipt quotes no price and no door code', () => {
  const mail = guestRequestReceipt({ ...base, units: ['main-lodge'] });
  assert.equal(/\$\d/.test(mail.body), false, 'the receipt quoted a price');
  assert.equal(/door\s*code/i.test(mail.body), false, 'the receipt mentioned a door code');
});

test('a two-house party is unaffected by the part code', () => {
  const mail = guestRequestReceipt({ ...base, houses: ['river', 'ranch'] });
  assert.match(mail.body, /The River House and The Ranch House/);
});
