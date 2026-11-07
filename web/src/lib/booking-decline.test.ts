import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DECLINE_REASONS,
  canDecline,
  declineHouses,
  declineLine,
  declineRecord,
  declineTally,
  guestDeclineMail,
  isDeclineReason,
} from './booking-decline.ts';

const request = {
  id: 'book-1',
  propertyId: 'river',
  alsoPropertyId: 'ranch',
  checkIn: '2026-12-01',
  checkOut: '2026-12-04',
  guests: 30,
};

test('a saved request can be declined; a booked one cannot', () => {
  assert.deepEqual(canDecline({ request, accepted: false, alreadyDeclined: false }), { ok: true });
  const booked = canDecline({ request, accepted: true, alreadyDeclined: false });
  assert.equal(booked.ok, false);
  if (!booked.ok) assert.match(booked.reason, /already a booking/);
  const twice = canDecline({ request, accepted: false, alreadyDeclined: true });
  assert.equal(twice.ok, false);
  if (!twice.ok) assert.match(twice.reason, /already declined/);
  const missing = canDecline({ request: null, accepted: false, alreadyDeclined: false });
  assert.equal(missing.ok, false);
});

test('a request with no real dates cannot be declined', () => {
  const bad = canDecline({ request: { ...request, checkIn: '2026-13-01' }, accepted: false, alreadyDeclined: false });
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.match(bad.reason, /dates we can decline/);
});

test('every offered reason is accepted and nothing else is', () => {
  for (const reason of DECLINE_REASONS) assert.equal(isDeclineReason(reason), true);
  assert.equal(isDeclineReason('because'), false);
  assert.equal(isDeclineReason(undefined), false);
  assert.equal(isDeclineReason(7), false);
});

test('a note is trimmed and capped', () => {
  const record = declineRecord('other', '  plumber coming  ', new Date('2026-11-07T12:00:00Z'));
  assert.equal(record.reason, 'other');
  assert.equal(record.note, 'plumber coming');
  assert.equal(record.at, '2026-11-07T12:00:00.000Z');
  assert.equal(declineRecord('maintenance', '   ').note, undefined);
  assert.equal(declineRecord('other', 'x'.repeat(500)).note?.length, 200);
});

test('the inbox line names the reason and never a price', () => {
  const line = declineLine(declineRecord('dates-taken', undefined));
  assert.match(line, /Declined: Those dates are taken/);
  assert.match(line, /The dates are free again/);
  assert.match(line, /Nothing was booked/);
  assert.equal(line.includes('$'), false);
  const noted = declineLine(declineRecord('other', 'septic work'));
  assert.match(noted, /septic work/);
});

test('the guest mail says not available, names the houses, and quotes no price', () => {
  const mail = guestDeclineMail({
    guestName: 'Ada Lovelace',
    houses: ['The River House', 'The Ranch House'],
    checkIn: '2026-12-01',
    checkOut: '2026-12-04',
    reason: 'dates-taken',
  });
  assert.match(mail.body, /Hi Ada,/);
  assert.match(mail.body, /The River House and The Ranch House/);
  assert.match(mail.body, /December 1, 2026 to December 4, 2026/);
  assert.match(mail.body, /already spoken for/);
  assert.match(mail.body, /If your dates can move/);
  assert.equal(mail.body.includes('$'), false);
  assert.equal(mail.subject.includes('$'), false);
  // It does not blame the guest and does not promise another house.
  assert.equal(/too many|you are|not allowed/i.test(mail.body), false);
  assert.equal(/another house|try the ranch|try lindon/i.test(mail.body), false);
});

test('each reason has its own guest sentence', () => {
  const seen = new Set<string>();
  for (const reason of DECLINE_REASONS) {
    const mail = guestDeclineMail({ guestName: 'A B', houses: ['The River House'], checkIn: '2026-12-01', checkOut: '2026-12-04', reason });
    // The reason sentence is the one before the apology.
    const lines = mail.body.split('\n');
    const apology = lines.findIndex((line) => line.startsWith('We are sorry'));
    assert.ok(apology > 0, `no apology line for ${reason}`);
    const sentence = lines[apology - 1] ?? '';
    assert.ok(sentence.length > 0, `no guest sentence for ${reason}`);
    assert.equal(/^\$\d/.test(sentence), false);
    seen.add(sentence);
  }
  // Seven reasons, and at least five distinct sentences, so they are not all one line.
  assert.ok(seen.size >= 5, 'the reasons read the same to a guest');
});

test('a host note reaches the guest and stays out of the subject', () => {
  const mail = guestDeclineMail({
    guestName: 'Ada Lovelace',
    houses: ['The River House'],
    checkIn: '2026-12-01',
    checkOut: '2026-12-04',
    reason: 'maintenance',
    note: 'The septic line is being replaced that week.',
  });
  assert.match(mail.body, /septic line is being replaced/);
  assert.equal(mail.subject.includes('septic'), false);
  // A note carrying a price is stripped like everything else.
  const priced = guestDeclineMail({
    guestName: 'A B',
    houses: ['The River House'],
    checkIn: '2026-12-01',
    checkOut: '2026-12-04',
    reason: 'other',
    note: 'We would need $900 for that week.',
  });
  assert.equal(priced.body.includes('$'), false);
});

test('the decline covers both houses a request names', () => {
  assert.deepEqual(declineHouses(request).sort(), ['ranch', 'river']);
  assert.deepEqual(declineHouses({ ...request, alsoPropertyId: undefined }), ['river']);
  assert.deepEqual(declineHouses({ ...request, propertyId: 'denver' }), []);
});

test('a bad date is not rendered as a date', () => {
  const mail = guestDeclineMail({ guestName: 'A B', houses: ['The River House'], checkIn: 'nope', checkOut: '2026-12-04', reason: 'other' });
  assert.equal(/Invalid Date/.test(mail.body), false);
});

test('a decline gives the guest a live path back to the booking page', () => {
  const mail = guestDeclineMail({
    guestName: 'Ada Lovelace',
    houses: ['The River House'],
    checkIn: '2027-12-01',
    checkOut: '2027-12-04',
    reason: 'dates-taken',
    retryHref: '/houses/river?in=2027-12-01&out=2027-12-04&guests=30',
    origin: 'https://wilhite-portfolio.pages.dev',
  });
  const link = mail.body.match(/https:\/\/\S+/)?.[0] ?? '';
  assert.equal(link, 'https://wilhite-portfolio.pages.dev/houses/river?in=2027-12-01&out=2027-12-04&guests=30');
  assert.match(mail.body, /move the dates yourself/);
  // The reply path is still offered beside the link.
  assert.match(mail.body, /Or reply to this message/);
});

test('an unsafe or missing link falls back to the reply wording', () => {
  const noLink = guestDeclineMail({
    guestName: 'A B',
    houses: ['The River House'],
    checkIn: '2027-12-01',
    checkOut: '2027-12-04',
    reason: 'other',
  });
  assert.match(noLink.body, /reply to this message with a range/);
  assert.equal(/https:\/\//.test(noLink.body), false);
  // A href that is not a plain same-site path is refused rather than pasted into an email.
  const unsafe = guestDeclineMail({
    guestName: 'A B',
    houses: ['The River House'],
    checkIn: '2027-12-01',
    checkOut: '2027-12-04',
    reason: 'other',
    retryHref: 'javascript:alert(1)',
    origin: 'https://wilhite-portfolio.pages.dev',
  });
  assert.equal(/javascript:/i.test(unsafe.body), false);
  assert.match(unsafe.body, /reply to this message with a range/);
});

test('a link with no origin is not printed as a bare path', () => {
  const mail = guestDeclineMail({
    guestName: 'A B',
    houses: ['The River House'],
    checkIn: '2027-12-01',
    checkOut: '2027-12-04',
    reason: 'other',
    retryHref: '/houses/river?in=2027-12-01&out=2027-12-04',
  });
  // Without an origin the path alone would not be clickable, so the reply wording is used.
  assert.match(mail.body, /reply to this message with a range/);
});

test('the tally counts reasons in the window and names the top one', () => {
  const records = [
    { reason: 'dates-taken', at: '2026-11-01T12:00:00Z' },
    { reason: 'dates-taken', at: '2026-11-03T12:00:00Z' },
    { reason: 'minimum-stay', at: '2026-11-04T12:00:00Z' },
    { reason: 'dates-taken', at: '2026-09-01T12:00:00Z' },
  ];
  const tally = declineTally(records, '2026-10-08');
  assert.equal(tally.total, 3, 'a decline outside the window was counted');
  assert.equal(tally.byReason[0]!.reason, 'dates-taken');
  assert.equal(tally.byReason[0]!.count, 2);
  assert.match(tally.line, /3 requests declined/);
  assert.match(tally.line, /most often because dates taken \(2 of 3\)/);
  assert.match(tally.line, /worth a rate or rule check/);
  assert.equal(tally.line.includes('$'), false);
});

test('one reason reads as all of them, and an empty window says so', () => {
  const one = declineTally([{ reason: 'maintenance', at: '2026-11-05T12:00:00Z' }], '2026-10-08');
  assert.equal(one.total, 1);
  assert.match(one.line, /1 request declined/);
  assert.match(one.line, /all because closed for work/);
  const none = declineTally([{ reason: 'maintenance', at: '2026-01-01T12:00:00Z' }], '2026-10-08');
  assert.equal(none.total, 0);
  assert.deepEqual(none.byReason, []);
  assert.match(none.line, /No request was declined/);
});

test('an unknown reason is left out of the tally rather than guessed', () => {
  const tally = declineTally([{ reason: 'because', at: '2026-11-05T12:00:00Z' }], '2026-10-08');
  assert.equal(tally.total, 0);
});
