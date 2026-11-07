import assert from 'node:assert/strict';
import test from 'node:test';
import { guestAcceptedMail, guestRequestReceipt, sentLine } from './booking-mail.ts';

const note = {
  guestName: 'Ada Lovelace',
  houses: ['river'],
  checkIn: '2026-12-01',
  checkOut: '2026-12-04',
  nights: 3,
  guests: 8,
};

test('the receipt says request, never confirmed, and carries no price', () => {
  const mail = guestRequestReceipt(note);
  assert.match(mail.body, /Hi Ada,/);
  assert.match(mail.body, /The River House, December 1, 2026 to December 4, 2026 \(3 nights\)/);
  assert.match(mail.body, /This is a request, not a confirmed booking/);
  assert.equal(/your stay is confirmed/i.test(mail.body), false);
  assert.equal(mail.body.includes('$'), false);
  assert.equal(/door code \d/i.test(mail.body), false);
});

test('the receipt names both houses and the party incl children', () => {
  const mail = guestRequestReceipt({ ...note, houses: ['river', 'ranch'], guests: 30, children: 4 });
  assert.match(mail.body, /The River House and The Ranch House/);
  assert.match(mail.body, /30 guests including 4 children/);
  const one = guestRequestReceipt({ ...note, guests: 1 });
  assert.match(one.body, /for 1 guest/);
  const kid = guestRequestReceipt({ ...note, guests: 6, children: 1 });
  assert.match(kid.body, /including 1 child/);
});

test('the accepted mail says confirmed and still carries no code or price', () => {
  const mail = guestAcceptedMail(note);
  assert.match(mail.body, /is confirmed for/);
  assert.match(mail.body, /4:00 PM/);
  assert.match(mail.body, /11:00 AM/);
  assert.match(mail.body, /door code opens on the guest phone the day before/);
  assert.equal(mail.body.includes('$'), false);
  assert.equal(/\b\d{4,8}\b\s*(is|opens)\b/i.test(mail.body), false);
});

test('a price or a code in the source is stripped before sending', () => {
  const receipt = guestRequestReceipt({ ...note, guestName: 'Guest $4,200' });
  assert.equal(receipt.body.includes('$'), false);
  assert.equal(guestAcceptedMail({ ...note, guestName: 'Guest' }).body.includes('$'), false);
});

test('the subject stays short and the host line masks the address', () => {
  const mail = guestRequestReceipt({ ...note, guestName: 'A'.repeat(400) });
  assert.ok(mail.subject.length <= 160);
  const line = sentLine('receipt', 'ada@example.com');
  assert.match(line, /ad…@example\.com/);
  assert.equal(line.includes('ada@example.com'), false);
  assert.match(sentLine('accepted', 'grace@example.com'), /confirmation went to gr…@example\.com/);
  assert.equal(sentLine('receipt', 'not-an-address').includes('@'), false);
});
