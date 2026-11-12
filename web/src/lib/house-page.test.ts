import assert from 'node:assert/strict';
import test from 'node:test';
import { bookShare, GROUP_TRIP, groupQuoteLink, groupQuotePending, groupQuoteUnread, companionStayFacts, companionStayNote, houseCardFacts, houseDateHold, houseDateLinkNote, houseLicenseLine, housePageHref, housePageSearch, houseQuoteHref, houseQuoteLabel, houseSafetyLine, parseHousePath, publicHouse, publicHouses, publicShare, readHouseDates, readHouseParty } from './house-page.ts';

test('each public house page uses the published guide and leaves prices and door codes off', () => {
  const houses = publicHouses();
  assert.deepEqual(
    houses.map((house) => house.id),
    ['river', 'ranch', 'lindon'],
  );
  for (const house of houses) {
    const text = JSON.stringify(house);
    assert.match(house.facts.join(' '), new RegExp(`Sleeps ${house.sleeps}`));
    assert.match(text, /4:00 PM/);
    assert.match(text, /11:00 AM/);
    assert.equal(text.includes('$'), false);
    assert.equal(/door\s*code|wi-?fi|password/i.test(text), false);
    assert.equal(house.schema['@type'], 'VacationRental');
    assert.equal(JSON.stringify(house.schema).includes('aggregateRating'), false);
    assert.equal(house.quoteHref, `/book/?house=${house.id}`);
  }
  const cards = houseCardFacts('river').join('\n');
  assert.match(cards, /Sleeps 22/);
  assert.match(cards, /Check-in 4:00 PM · Check-out 11:00 AM/);
  assert.match(cards, /Architectural rendering/);
  assert.equal(cards.includes('$'), false);
  assert.match(houseCardFacts('ranch').join('\n'), /Sleeps 20/);
  assert.equal(houseCardFacts('lindon').join('\n').includes('rendering'), false);
  const ranchStay = companionStayFacts('ranch').join('\n');
  assert.match(ranchStay, /The Ranch House/);
  assert.match(ranchStay, /Sleeps 20/);
  assert.match(ranchStay, /270 East Center Street/);
  assert.match(ranchStay, /Park in the driveway/);
  assert.equal(ranchStay.includes('rendering'), false);
  assert.equal(ranchStay.includes('$'), false);
  assert.match(companionStayFacts('river').join('\n'), /Architectural rendering/);
  assert.match(companionStayNote(), /other house/);
  assert.equal(/\bis open\b/.test(companionStayNote()), false);
  const river = publicHouse('river');
  assert.match(JSON.stringify(river.schema.containsPlace), /eight king suites/);
  /*
   * These two used to assert the *absence* of a bedroom count in the structured data, because `house-stay.ts` held
   * `null` for both houses — the layout was published on the listings but nowhere on our own page. It is filled in now,
   * so the right assertion is that the schema carries it: a vacation-rental listing with no bedroom count is worse for
   * a guest searching and for a search engine indexing the page.
   */
  for (const house of ['lindon', 'ranch'] as const) {
    const place = JSON.stringify(publicHouse(house).schema.containsPlace);
    assert.match(place, /Bedrooms/, `${house} structured data does not carry a bedroom count`);
    assert.equal(place.includes('$'), false, `${house} structured data quotes a price`);
  }
  assert.match(river.photo.caption, /rendering/);
  assert.match(river.opening ?? '', /November 1, 2026/);
  assert.match(river.address, /Vivian Park/);
  assert.equal((river.schema.address as { postalCode: string }).postalCode, '84604');
  const ranch = publicHouse('ranch');
  // The Ranch's layout is published now, so its schema carries the bedroom count like the other two.
  assert.match(JSON.stringify(ranch.schema.containsPlace), /Bedrooms/);
  const names = (house: ReturnType<typeof publicHouse>) =>
    (house.schema.amenityFeature as { name: string }[]).map((item) => item.name);
  const shared = ['No lifeguard on duty', 'No fireworks', 'Short stay, not a residential lease'];
  assert.deepEqual(names(river), ['No smoking indoors', 'No parties or events without written approval', ...shared]);
  assert.deepEqual(names(publicHouse('lindon')), ['No smoking indoors', 'No parties', ...shared]);
  assert.deepEqual(names(ranch), ['No smoking indoors', 'No parties', 'Hot tub', ...shared]);
  assert.equal(JSON.stringify(river.schema.amenityFeature).includes('$'), false);
  const safety = houseSafetyLine();
  assert.match(safety, /No lifeguard is on duty/);
  assert.match(safety, /No fireworks/);
  assert.match(safety, /does not sign/);
  assert.equal(safety.includes('$'), false);
  const license = houseLicenseLine();
  assert.match(license, /not a residential lease/);
  assert.match(license, /The stay ends at checkout/);
  assert.equal(license.includes('$'), false);
  assert.match(ranch.notes.map((note) => note.title).join(' '), /Hot tub/);
  assert.match(ranch.address, /270 East Center Street/);
  assert.equal(GROUP_TRIP.includes('$'), false);
  assert.match(GROUP_TRIP, /does not hold either house/);
  const open = groupQuoteLink('2026-11-16', '2026-11-18', []);
  assert.equal(open.label, 'Quote both houses');
  assert.equal(groupQuotePending().label, 'Reading the calendar.');
  assert.equal(/\bquote\b/i.test(groupQuotePending().label), false);
  assert.equal(groupQuotePending().label.includes('$'), false);
  assert.equal(open.href, '/book/?house=river&guests=30&in=2026-11-16&out=2026-11-18');
  const booked = groupQuoteLink('2026-11-25', '2026-11-27', [
    { house: 'ranch', line: 'Ranch: Those nights are already booked.' },
  ]);
  assert.match(booked.label, /Those nights are already booked/);
  assert.match(booked.label, /Nothing is sent/);
  assert.equal(booked.label.includes('$'), false);
  assert.equal(/\bis open\b/.test(booked.label), false);
  assert.match(booked.href, /in=2026-11-25/);
  assert.equal(booked.quoted, false);
  const both = groupQuoteLink('2026-11-06', '2026-11-08', [], {
    asOf: '2026-10-31',
    taken: { river: [], ranch: [], lindon: [] },
  });
  assert.equal(both.label, 'Quote both houses');
  assert.equal(both.quoted, true);
  assert.match(both.href, /guests=30/);
  assert.match(both.href, /in=2026-11-06/);
  const short = groupQuoteLink('2026-12-20', '2026-12-22', [], {
    asOf: '2026-10-31',
    taken: { river: [], ranch: [], lindon: [] },
  });
  assert.match(short.label, /at least 5 nights/);
  assert.match(short.label, /Nothing is sent/);
  assert.equal(short.quoted, false);
  assert.equal(short.label.includes('$'), false);
  assert.match(short.href, /out=2026-12-22/);
  const ranchBooked = groupQuoteLink('2026-11-25', '2026-11-29', [], {
    asOf: '2026-10-31',
    taken: { ranch: ['2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28'] },
  });
  assert.match(ranchBooked.label, /Ranch: Those nights are already booked/);
  assert.equal(ranchBooked.quoted, false);
  assert.equal(/\bis open\b/.test(ranchBooked.label), false);
  const oneHouse = groupQuoteLink('2026-11-06', '2026-11-08', [], {
    asOf: '2026-10-31',
    taken: { river: [], ranch: [], lindon: [] },
  }, { guests: 4 });
  assert.equal(oneHouse.label, 'This party fits one house. Nothing is sent.');
  assert.equal(oneHouse.quoted, false);
  assert.match(oneHouse.href, /guests=4/);
  assert.equal(oneHouse.href.includes('guests=30'), false);
  const sized = groupQuoteLink('2026-11-06', '2026-11-08', [], {
    asOf: '2026-10-31',
    taken: { river: [], ranch: [], lindon: [] },
  }, { guests: 36 });
  assert.equal(sized.label, 'Quote both houses');
  assert.equal(sized.quoted, true);
  assert.match(sized.href, /guests=36/);
  const over = groupQuoteLink('2026-11-06', '2026-11-08', [], {
    asOf: '2026-10-31',
    taken: { river: [], ranch: [], lindon: [] },
  }, { guests: 50 });
  assert.match(over.label, /together sleep 42/);
  assert.equal(over.quoted, false);
  assert.match(over.href, /guests=50/);
  assert.equal(over.label.includes('$'), false);
  assert.equal(/\bis open\b/.test(`${oneHouse.label} ${sized.label} ${over.label}`), false);
  const unread = groupQuoteUnread();
  assert.match(unread.label, /could not be read/);
  assert.equal(/\bquote\b/i.test(unread.label), false);
  assert.equal(unread.label.includes('$'), false);
});

test('the public tab uses the house name and does not quote a price', () => {
  const index = publicShare('index');
  assert.match(index.title, /The houses/);
  assert.match(index.description, /does not charge a card/);
  assert.equal(index.description.includes('$'), false);
  assert.equal(/\bopen\b/.test(index.description), false);
  const river = publicShare('river');
  assert.match(river.title, /River House/);
  assert.match(river.description, /Sleeps 22/);
  /*
   * The slashed house URL. It used to be unslashed, which meant every social preview advertised an address that
   * redirects — and scrapers do not all follow a redirect for `og:url`.
   */
  assert.match(river.url, /\/houses\/river\/$/);
  assert.equal(river.canonical, river.url, 'the canonical a house page declares differs from the link it shares');
  assert.equal(river.description.includes('$'), false);
  assert.equal(/door\s*code|wi-?fi|password|\b801\b/i.test(`${river.title} ${river.description}`), false);
  const quote = bookShare('lindon');
  assert.match(quote.title, /Lindon House/);
  assert.match(quote.url, /\/book\/\?house=lindon$/);
  assert.equal(quote.description.includes('$'), false);
  const dated = bookShare('river', { checkIn: '2026-11-06', checkOut: '2026-11-08', guests: '36', children: '2' });
  assert.match(dated.url, /\/book\/\?house=river&in=2026-11-06&out=2026-11-08&guests=36&children=2$/);
  assert.match(dated.title, /River House/);
  assert.equal(dated.url.includes('$'), false);
  assert.equal(bookShare('ranch', { guests: '4' }).url.endsWith('/book/?house=ranch&guests=4'), true);
  assert.equal(
    bookShare('river', { checkIn: '2026-11-08', checkOut: '2026-11-06', guests: '4' }).url.endsWith('/book/?house=river&guests=4'),
    true,
  );
});

test('a house page quote link keeps dates only after both are chosen', () => {
  assert.equal(houseQuoteHref('ranch', '', ''), '/book/?house=ranch');
  assert.equal(houseQuoteHref('ranch', '2026-11-13', ''), '/book/?house=ranch');
  assert.equal(houseQuoteHref('ranch', '2026-11-15', '2026-11-13'), '/book/?house=ranch');
  assert.equal(houseQuoteHref('ranch', '2026-11-13', '2026-11-15'), '/book/?house=ranch&in=2026-11-13&out=2026-11-15');
  const hold = houseDateHold('2026-11-13', '');
  assert.match(hold, /Choose the checkout morning/);
  assert.match(hold, /does not say the house is open/);
  assert.equal(hold.includes('$'), false);
  assert.equal(houseDateHold('2026-11-13', '2026-11-15'), '');
  assert.deepEqual(readHouseDates('?in=2026-11-13&out=2026-11-15'), { checkIn: '2026-11-13', checkOut: '2026-11-15' });
  assert.deepEqual(readHouseDates('?in=2026-11-15&out=2026-11-13'), { checkIn: '', checkOut: '' });
  assert.equal(housePageSearch('2026-11-13', '2026-11-15'), '?in=2026-11-13&out=2026-11-15');
  assert.equal(housePageSearch('2026-11-13', ''), '');
  assert.equal(housePageHref('ranch', '2026-11-13', '2026-11-15', '2'), '/houses/ranch?in=2026-11-13&out=2026-11-15&guests=2');
  assert.equal(
    houseQuoteHref('ranch', '2026-11-13', '2026-11-15', '2', '1'),
    '/book/?house=ranch&in=2026-11-13&out=2026-11-15&guests=2&children=1',
  );
  assert.equal(
    houseQuoteHref('ranch', '2026-11-13', '2026-11-15', '30'),
    '/book/?house=river&in=2026-11-13&out=2026-11-15&guests=30',
  );
  assert.equal(houseQuoteLabel('ranch', '30'), 'See both houses');
  assert.equal(
    houseQuoteHref('ranch', '2026-11-13', '2026-11-15', '22'),
    '/book/?house=river&in=2026-11-13&out=2026-11-15&guests=22',
  );
  assert.equal(houseQuoteLabel('ranch', '22'), 'See the River House');
  assert.equal(houseQuoteHref('lindon', '2026-11-13', '2026-11-15', '18'), '/book/?house=lindon&in=2026-11-13&out=2026-11-15&guests=18');
  assert.equal(houseQuoteHref('ranch', '2026-11-13', '2026-11-15', '46'), '/book/?house=ranch&in=2026-11-13&out=2026-11-15&guests=46');
  assert.deepEqual(readHouseParty('?guests=2&children=0'), { guests: '2', children: '' });
  const link = houseDateLinkNote('2026-11-13', '2026-11-15');
  assert.match(link, /keeps these dates/);
  assert.match(link, /does not hold them/);
  assert.equal(link.includes('$'), false);
});

test('the public paths are only the index and the three houses', () => {
  assert.equal(parseHousePath('/houses'), 'index');
  assert.equal(parseHousePath('/houses/'), 'index');
  assert.equal(parseHousePath('/houses/river'), 'river');
  assert.equal(parseHousePath('/houses/ranch/'), 'ranch');
  assert.equal(parseHousePath('/houses/lindon'), 'lindon');
  assert.equal(parseHousePath('/houses/construction'), null);
  assert.equal(parseHousePath('/book/'), null);
});
