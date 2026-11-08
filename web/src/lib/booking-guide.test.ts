import assert from 'node:assert/strict';
import test from 'node:test';
import { bookingGuide, printGuideButton, printPriceNote, quotePaper, stayRequestNote, stayRequestPromoLine } from './booking-guide.ts';
import { guestPromoLine, quoteStay } from './quote.ts';

test('the printed house guide leaves the door code off the paper', () => {
  const guide = bookingGuide('river', '2026-11-06', '2026-11-08');
  const text = JSON.stringify(guide);
  assert.equal(guide.name, 'The River House');
  assert.match(guide.facts.join('\n'), /Architectural rendering/);
  assert.equal(bookingGuide('ranch', '2026-11-06', '2026-11-08').facts.join('\n').includes('rendering'), false);
  assert.equal(guide.checkout[0], 'Start the dishwasher.');
  assert.match(text, /sundanceresort\.com/);
  assert.match(text, /Dates on this quote: 2026-11-06 to 2026-11-08/);
  assert.match(text, /Arrive November 6, 2026 at 4:00 PM/);
  assert.match(text, /Quiet hours in this mountain neighborhood/);
  assert.match(text, /Leave November 8, 2026 at 11:00 AM/);
  assert.match(text, /The door code stays off this page/);
  assert.equal(/day before check-in/i.test(text), false);
  assert.match(text, /Occupancy\. The stay is for the guests on the booking\. This paper does not/);
  assert.match(text, /The river and the septic are part of this stay\. This paper does not sign a release/);
  assert.match(text, /at least 2 nights/);
  assert.match(text, /Thanksgiving is 4 nights/);
  assert.match(text, /A request can cover up to 28 nights/);
  assert.match(bookingGuide('ranch', '2026-11-06', '2026-11-08').nights.join('\n'), /A weekday can be 1 night/);
  assert.equal(text.includes('Canyon grocery drop') && text.includes('$'), false);
  assert.match(text, /Canyon grocery drop/);
  assert.match(text, /This list has no price and does not send a request/);
  const live = bookingGuide(
    'ranch',
    '2026-11-16',
    '2026-11-18',
    { asOf: '2026-10-31' },
    { checkIn: '2026-11-16', checkOut: '2026-11-18', taken: ['2026-11-25'] },
  );
  const liveText = live.facts.join('\n');
  assert.match(liveText, /Arrive at 1:00 PM is a request/);
  assert.match(liveText, /Leave at 2:00 PM is a request/);
  assert.equal(liveText.includes('calendar can be read'), false);
  assert.equal(/\bis open\b/i.test(liveText), false);
  assert.equal(liveText.includes('The door code still opens'), false);
  const bookedNight = bookingGuide(
    'ranch',
    '2026-11-29',
    '2026-12-01',
    { asOf: '2026-10-31' },
    { checkIn: '2026-11-29', checkOut: '2026-12-01', taken: ['2026-11-28'] },
  );
  assert.match(bookedNight.facts.join('\n'), /An early arrival is not open for this stay/);
  assert.match(bookingGuide('ranch', '2026-11-06', '2026-11-08').facts.join('\n'), /Hot tub ready at arrival/);
  assert.equal(bookingGuide('lindon', '2026-11-06', '2026-11-08').facts.join('\n').includes('Hot tub'), false);
  assert.equal(text.includes('This phone'), false);
  assert.equal(text.includes('$'), false);
  assert.match(guide.close, /does not hold the dates/);
  assert.match(text, /The door code stays off this paper/);
  assert.equal(guide.facts.filter((line) => line.includes('The door code and Wi-Fi open')).length, 0);
  assert.equal(guide.facts.filter((line) => line.includes('The door code stays off this page')).length, 1);
  const compared = bookingGuide('ranch', '2026-11-13', '2026-11-14', { asOf: '2026-10-30', guests: 4 });
  const comparedText = compared.compared.join('\n');
  assert.match(comparedText, /The Ranch House/);
  assert.match(comparedText, /The River House/);
  assert.match(comparedText, /The Lindon House/);
  assert.match(comparedText, /Nothing is sent/);
  assert.equal(comparedText.includes('$'), false);
  assert.match(compared.shortest, /through November 15, 2026, 2 nights/);
  assert.match(compared.shortest, /Nothing is charged yet/);
  assert.equal(compared.shortest.includes('$'), false);
  assert.equal(compared.shortest.replace(/does not say the house is open/gi, '').toLowerCase().includes('house is open'), false);
  const passing = bookingGuide('ranch', '2026-11-13', '2026-11-15', { asOf: '2026-10-30', guests: 4 });
  assert.equal(passing.compared.length, 0);
  assert.equal(passing.shortest, '');
  assert.equal(bookingGuide('ranch', '2026-11-13', '2026-11-14').compared.length, 0);
  assert.equal(bookingGuide('ranch', '2026-11-13', '2026-11-14').shortest, '');
  assert.equal(/password/i.test(text), false);
  assert.equal(guide.nearby[0], 'Ski');
  assert.equal(bookingGuide('ranch', '2026-11-04', '2026-11-05').nearby.includes('Before you go'), true);
  const quote = quoteStay('ranch', '2026-11-04', '2026-11-05', [], {
    asOf: '2026-10-30',
    pace: 'short',
    guests: 4,
    children: 1,
  });
  const paper = quotePaper({
    ok: quote.ok,
    reason: quote.reason,
    nights: quote.nights.length,
    lodging: quote.lodging,
    cleaning: quote.cleaning,
    stayTotal: quote.stayTotal,
    party: 'Overnight guests 4, including 1 child.',
    arrival: 'Arrival around 6:00 PM.',
    departure: 'Leave at 11:00 AM.',
  });
  assert.equal(quote.ok, true);
  assert.match(paper[0] ?? '', /before tax for 1 night/);
  assert.match(paper.join(' '), /1 child/);
  assert.match(paper.join(' '), /6:00 PM/);
  assert.match(paper.join(' '), /Leave at 11:00 AM/);
  const apart = quotePaper({
    ok: quote.ok,
    reason: quote.reason,
    nights: quote.nights.length,
    lodging: quote.lodging,
    cleaning: quote.cleaning,
    stayTotal: quote.stayTotal,
    party: 'Overnight guests 4, including 1 child.',
    arrival: 'Arrival around 6:00 PM.',
    addon: 'Hot tub ready at arrival is not in that total. Nothing is charged yet.',
  });
  assert.match(apart.join(' '), /not in that total/);
  assert.match(apart.join(' '), /Nothing is charged yet/);
  assert.match(apart.join(' '), /before tax/);
  const heldApart = quotePaper({
    ok: true,
    reason: null,
    nights: quote.nights.length,
    lodging: quote.lodging,
    cleaning: quote.cleaning,
    stayTotal: quote.stayTotal,
    party: '',
    arrival: '',
    event: 'The Ranch House does not take a party. This page does not send that request.',
    addon: 'Hot tub ready at arrival is not in that total. Nothing is charged yet.',
  });
  assert.equal(heldApart.join(' ').includes('not in that total'), false);
  assert.match(paper.at(-1) ?? '', /does not hold the dates or charge a card/);
  assert.equal(paper.join(' ').includes('Ada'), false);
  const refused = quotePaper({
    ok: false,
    reason: 'A stay needs an adult.',
    nights: 1,
    lodging: quote.lodging,
    cleaning: quote.cleaning,
    stayTotal: quote.stayTotal,
    party: 'Overnight guests 4, including 4 children.',
    arrival: '',
  });
  assert.equal(refused.join(' ').includes('$'), false);
  assert.match(refused[0] ?? '', /adult/);
  const bookedPaper = quotePaper({
    ok: false,
    reason: 'Those nights are booked.',
    nights: quote.nights.length,
    lodging: quote.lodging,
    cleaning: quote.cleaning,
    stayTotal: quote.stayTotal,
    party: 'Overnight guests 4.',
    arrival: 'Arrival around 6:00 PM.',
    agreement: 'Open each topic before the request. Opening a topic does not sign the agreement.',
  });
  assert.match(bookedPaper[0] ?? '', /Those nights are booked/);
  assert.equal(bookedPaper.join(' ').includes('Open each topic'), false);
  assert.equal(bookedPaper.join(' ').includes('$'), false);
  const held = quotePaper({
    ok: true,
    reason: null,
    nights: quote.nights.length,
    lodging: quote.lodging,
    cleaning: quote.cleaning,
    stayTotal: quote.stayTotal,
    party: 'Overnight guests 4, including 1 child.',
    arrival: 'Arrival around 6:00 PM.',
    event: 'The River House does not take a party or event without written approval. This page does not send that request.',
  });
  assert.match(held[0] ?? '', /written approval/);
  assert.match(held.at(-1) ?? '', /does not hold the dates/);
  assert.equal(held.join(' ').includes('$'), false);
  assert.equal(held.join(' ').includes('before tax'), false);
  const unread = quotePaper({
    ok: true,
    reason: null,
    nights: quote.nights.length,
    lodging: quote.lodging,
    cleaning: quote.cleaning,
    stayTotal: quote.stayTotal,
    party: 'Overnight guests 4.',
    arrival: '',
    agreement: 'Open each topic before the request. Opening a topic does not sign the agreement. This page does not send that request.',
  });
  assert.match(unread[0] ?? '', /Open each topic/);
  assert.match(unread[0] ?? '', /does not sign the agreement/);
  assert.equal(unread.join(' ').includes('$'), false);
  assert.equal(unread.join(' ').includes('before tax'), false);
});

test('an unread calendar leaves the price off the printed guide', () => {
  const unread = printPriceNote('unread');
  assert.match(unread, /leaves the price off/);
  assert.match(unread, /does not charge a card/);
  assert.match(unread, /A name stays off the paper/);
  assert.equal(unread.includes('$'), false);
  assert.equal(unread.includes('includes this price'), false);
  const refused = printPriceNote('refused');
  assert.match(refused, /This stay is not quoted/);
  assert.equal(refused.includes('includes this price'), false);
  assert.equal(refused.includes('$'), false);
  assert.equal(printGuideButton('refused'), 'Print these dates');
  assert.equal(printGuideButton('unread'), 'Print these dates');
  const held = printPriceNote('held');
  assert.match(held, /until the request can be sent/);
  assert.equal(held.includes('includes this price'), false);
  assert.equal(printGuideButton('held'), 'Print this quote');
  const live = printPriceNote('priced');
  assert.match(live, /includes this price/);
  assert.equal(live.includes('$'), false);
  assert.equal(printGuideButton('priced'), 'Print this quote');
});

test('a single-house request note includes the guest discount', () => {
  const note = stayRequestNote({
    guestNote: '',
    party: 'Overnight guests 4.',
    arrival: '',
    departure: '',
    preview: 'Preview quote before tax (2 nights).',
    promo: guestPromoLine(2),
    addon: 'Add-on request: Arrive at 1:00 PM. Nothing is charged yet.',
    rules: 'No smoking indoors.',
    agreement: 'I have read the Ranch House.',
  });
  assert.match(note, /2 nights are 20% off/);
  assert.match(note, /Overnight guests 4/);
  assert.equal(/\bfill\b/i.test(note), false);
  assert.equal(note.includes('$'), false);
  const plain = stayRequestNote({
    guestNote: '',
    party: 'Overnight guests 4.',
    arrival: '',
    departure: '',
    preview: 'Preview quote before tax (2 nights).',
    promo: guestPromoLine(0),
    addon: '',
    rules: '',
    agreement: '',
  });
  assert.equal(plain.includes('20% off'), false);
  const leaked = stayRequestNote({
    guestNote: '',
    party: '',
    arrival: '',
    departure: '',
    preview: 'Preview quote before tax (2 nights).',
    promo: `${guestPromoLine(2)} The door code still opens the day before.`,
    addon: '',
    rules: '',
    agreement: '',
  });
  assert.match(leaked, /2 nights are 20% off/);
  assert.equal(/door code/i.test(leaked), false);
  const hostWords = stayRequestNote({
    guestNote: '',
    party: '',
    arrival: '',
    departure: '',
    preview: 'Preview quote before tax (2 nights).',
    promo: 'The 20% fill rate is on.',
    addon: '',
    rules: '',
    agreement: '',
  });
  assert.equal(hostWords.includes('fill'), false);
  assert.equal(hostWords.includes('20% off'), false);
  assert.match(stayRequestPromoLine(guestPromoLine(2)), /includes that discount/);
  assert.equal(stayRequestPromoLine(guestPromoLine(2)).includes('$'), false);
  assert.equal(stayRequestPromoLine(''), '');
  assert.equal(stayRequestPromoLine('The 20% fill rate is on.'), '');
});
