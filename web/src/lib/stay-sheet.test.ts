import assert from 'node:assert/strict';
import test from 'node:test';
import { nearbyGroups } from './house-stay.ts';
import { houseCheckout, houseStay, STAY_EMERGENCY } from './house-stay.ts';
import { bothHousePaperNote, bothHousePapers, quotePaperTimes, tripNearbyNote, tripPaperNote, tripSheet } from './stay-sheet.ts';

test('a trip sheet names the arrival and leaves the door code off the paper', () => {
  const sheet = tripSheet({
    house: 'River House',
    checkIn: '2026-11-06',
    checkOut: '2026-11-08',
    checkInTime: '4:00 PM',
    checkOutTime: '11:00 AM',
    address: 'Vivian Park, Provo Canyon, Utah 84604',
    arrival: 'The house sits at Vivian Park.',
    parking: 'Park in the drive.',
    rules: 'No parties.',
    houseId: 'river',
    notes: [
      { title: 'Septic', body: 'Only toilet paper goes in the toilets.' },
      { title: 'Door code', body: '1234' },
      { title: 'Wi-Fi', body: 'network secret' },
    ],
    emergency: 'For a fire, medical emergency, or anyone in danger, call 911 first, then call us.',
    checkout: ['Strip the beds', ' ', 'Door code 9999'],
    nearby: [
      { name: 'Sundance Mountain Resort', note: 'Your home mountain.', area: 'About 10 minutes up the canyon', url: 'https://www.sundanceresort.com', kind: 'ski' },
      { name: 'Wi-Fi', note: 'password hidden' },
    ],
  });
  assert.equal(sheet.house, 'River House');
  assert.equal(sheet.when, 'Check-in 4:00 PM on November 6, 2026. Checkout 11:00 AM on November 8, 2026.');
  assert.equal(sheet.event, 'This stay covers BYU at Utah. Nothing extra is added for that.');
  assert.equal(sheet.event.includes('$'), false);
  assert.equal(sheet.address, 'Vivian Park, Provo Canyon, Utah 84604');
  assert.match(sheet.photo, /Architectural rendering/);
  assert.equal(sheet.photo.includes('$'), false);
  assert.match(sheet.privateNote, /not on this paper/);
  assert.equal(sheet.arrival, 'The house sits at Vivian Park.');
  assert.equal(sheet.parking, 'Park in the drive.');
  assert.equal(sheet.rules, 'No parties.');
  assert.match(sheet.agreement, /the river/);
  assert.match(sheet.agreement, /This paper does not sign it/);
  assert.match(sheet.agreement, /Occupancy\. The stay is for the guests/);
  assert.match(sheet.agreement, /The river and the septic/);
  assert.equal(sheet.agreement.includes('This phone'), false);
  assert.equal(sheet.agreement.includes('$'), false);
  const secret = tripSheet({
    house: 'River House',
    checkIn: '2026-11-06',
    checkOut: '2026-11-08',
    checkInTime: '4:00 PM',
    checkOutTime: '11:00 AM',
    arrival: 'Door code is 1234',
    parking: 'Wi-Fi password is hidden',
    rules: 'Quiet hours. Door code 4321',
  });
  assert.equal(secret.arrival, '');
  assert.equal(secret.parking, '');
  assert.equal(secret.rules, '');
  assert.deepEqual(sheet.notes, [{ title: 'Septic', body: 'Only toilet paper goes in the toilets.' }]);
  assert.equal(sheet.nearby[0]?.kind, 'ski');
  assert.equal(nearbyGroups(sheet.nearby)[0]?.label, 'Ski');
  assert.equal(sheet.nearby[0]?.site, 'sundanceresort.com');
  assert.match(sheet.nearby[0]?.href ?? '', /^https:\/\/www\.sundanceresort\.com/);
  assert.equal(/password/i.test(JSON.stringify(sheet.nearby)), false);
  assert.match(sheet.emergency, /call 911 first/);
  assert.equal(
    tripSheet({
      house: 'River House',
      checkIn: '2026-11-06',
      checkOut: '2026-11-08',
      checkInTime: '4:00 PM',
      checkOutTime: '11:00 AM',
      emergency: 'Door code 9999',
    }).emergency,
    '',
  );
  assert.deepEqual(sheet.checkout, ['Strip the beds']);
  assert.equal(Object.hasOwn(sheet, 'doorCode'), false);
  assert.equal(Object.hasOwn(sheet, 'wifiPassword'), false);
  assert.equal(JSON.stringify(sheet).includes('1234'), false);
  assert.equal(JSON.stringify(sheet).toLowerCase().includes('network secret'), false);
  assert.equal(sheet.guestArrival, '');
  const named = tripSheet({
    house: 'River House',
    checkIn: '2026-11-06',
    checkOut: '2026-11-08',
    checkInTime: '4:00 PM',
    checkOutTime: '11:00 AM',
    guestArrival: '6:00 PM',
  });
  assert.equal(named.guestArrival, 'Arrival around 6:00 PM.');
  const leaving = tripSheet({
    house: 'River House',
    checkIn: '2026-11-06',
    checkOut: '2026-11-08',
    checkInTime: '4:00 PM',
    checkOutTime: '11:00 AM',
    guestDeparture: '11:00 AM',
  });
  assert.equal(leaving.guestDeparture, 'Leave at 11:00 AM.');
  const badLeave = tripSheet({
    house: 'River House',
    checkIn: '2026-11-06',
    checkOut: '2026-11-08',
    checkInTime: '4:00 PM',
    checkOutTime: '11:00 AM',
    guestDeparture: '801-555-0100',
  });
  assert.equal(badLeave.guestDeparture, '');
  assert.equal(leaving.checkoutRule, '');
  const openLeave = tripSheet({
    house: 'River House',
    checkIn: '2026-11-06',
    checkOut: '2026-11-08',
    checkInTime: '4:00 PM',
    checkOutTime: '11:00 AM',
    laterLeaveOpen: true,
    guestDeparture: '801-555-0100',
  });
  assert.match(openLeave.checkoutRule, /Leave at 2:00 PM is a request/);
  assert.match(openLeave.checkoutRule, /Nothing is charged yet/);
  assert.equal(openLeave.checkoutRule.includes('801'), false);
  assert.equal(openLeave.checkoutRule.includes('$'), false);
  const takenLeave = tripSheet({
    house: 'River House',
    checkIn: '2026-11-06',
    checkOut: '2026-11-08',
    checkInTime: '4:00 PM',
    checkOutTime: '11:00 AM',
    laterLeaveOpen: false,
  });
  assert.match(takenLeave.checkoutRule, /not open for this stay/);
  assert.equal(takenLeave.checkoutRule.includes('2:00 PM'), false);
  const earlyOpen = tripSheet({
    house: 'River House',
    checkIn: '2026-11-06',
    checkOut: '2026-11-08',
    checkInTime: '4:00 PM',
    checkOutTime: '11:00 AM',
    nightBeforeFree: true,
  });
  assert.match(earlyOpen.earlyRule, /Arrive at 1:00 PM is a request/);
  assert.equal(/password|code\s*\d/i.test(earlyOpen.earlyRule), false);
  assert.equal(earlyOpen.earlyRule.includes('$'), false);
  const earlyClosed = tripSheet({
    house: 'River House',
    checkIn: '2026-11-06',
    checkOut: '2026-11-08',
    checkInTime: '4:00 PM',
    checkOutTime: '11:00 AM',
    nightBeforeFree: false,
  });
  assert.match(earlyClosed.earlyRule, /An early arrival is not open/);
  assert.equal(tripSheet({
    house: 'River House',
    checkIn: '2026-11-06',
    checkOut: '2026-11-08',
    checkInTime: '4:00 PM',
    checkOutTime: '11:00 AM',
  }).earlyRule, '');
  const junk = tripSheet({
    house: 'River House',
    checkIn: '2026-11-06',
    checkOut: '2026-11-08',
    checkInTime: '4:00 PM',
    checkOutTime: '11:00 AM',
    guestArrival: '801-555-0100',
  });
  assert.equal(junk.guestArrival, '');
});

test('the published river guide can be paper without a code or a price', () => {
  const guide = houseStay('river');
  const sheet = tripSheet({
    house: 'The River House',
    houseId: 'river',
    checkIn: '2026-11-13',
    checkOut: '2026-11-15',
    checkInTime: guide.checkIn,
    checkOutTime: guide.checkOut,
    address: 'Vivian Park, Provo Canyon, Utah 84604',
    arrival: guide.arrival,
    parking: guide.parking,
    notes: guide.notes,
    nearby: guide.nearby,
    emergency: STAY_EMERGENCY,
    checkout: houseCheckout('river'),
  });
  const note = tripPaperNote();
  const text = `${note}\n${JSON.stringify(sheet)}`;
  assert.match(sheet.when, /November 13, 2026/);
  assert.match(sheet.event, /BYU vs Baylor/);
  assert.match(note, /not a booking/);
  assert.match(note, /Nothing is sent/);
  assert.equal(text.includes('$'), false);
  assert.equal(/code\s*\d/i.test(text), false);
  assert.equal(/\bthe house is open\b/i.test(text), false);
  const nearby = tripNearbyNote();
  assert.match(nearby, /no price/);
  assert.match(nearby, /not a booking/);
  assert.equal(nearby.includes('$'), false);
  assert.equal(nearbyGroups(sheet.nearby).some((group) => group.kind === 'ski'), true);
  assert.equal(sheet.nearby.some((place) => place.name === 'Sundance Mountain Resort'), true);
});

test('a chosen arrival and an 11:00 AM leave go on the paper without booking the stay', () => {
  const named = quotePaperTimes('5:00 PM', '11:00 AM', false);
  assert.match(named, /Arrival around 5:00 PM/);
  assert.match(named, /Leave at 11:00 AM/);
  assert.match(named, /not booked/);
  assert.match(named, /Nothing is sent/);
  assert.equal(named.includes('$'), false);
  assert.equal(quotePaperTimes('5:00 PM', '2:00 PM', false).includes('2:00 PM'), false);
  assert.equal(quotePaperTimes(null, null, false), '');
  assert.match(quotePaperTimes('After 9:00 PM', null, false), /Quiet hours still apply/);
});

test('a two-house paper names each house and leaves the door-code timing off', () => {
  const papers = bothHousePapers({ checkIn: '2026-11-06', checkOut: '2026-11-08', early: true, late: true });
  assert.deepEqual(
    papers.map((paper) => paper.id),
    ['river', 'ranch'],
  );
  const river = papers[0]!;
  const ranch = papers[1]!;
  assert.match(river.photo, /Architectural rendering/);
  assert.equal(ranch.photo, 'Listing photo');
  assert.match(river.address, /Vivian Park/);
  assert.match(ranch.address, /Lindon/);
  assert.match(river.when, /November 6, 2026/);
  assert.match(river.when, /November 8, 2026/);
  assert.match(river.event, /BYU/);
  assert.equal(river.checkout.some((step) => /toilet paper/i.test(step)), true);
  assert.equal(ranch.checkout.some((step) => /hot tub cover/i.test(step)), true);
  assert.match(river.earlyRule, /both houses/);
  assert.match(river.checkoutRule, /2:00 PM is a request for both houses/);
  const closed = bothHousePapers({ checkIn: '2026-12-16', checkOut: '2026-12-18', early: true, late: false });
  assert.match(closed[0]!.checkoutRule, /not open for both houses/);
  assert.match(closed[0]!.earlyRule, /1:00 PM is a request for both houses/);
  const note = bothHousePaperNote();
  const text = `${note}\n${JSON.stringify(papers)}\n${JSON.stringify(closed)}`;
  assert.match(note, /both houses/);
  assert.match(note, /not booked/);
  assert.match(note, /Nothing is sent/);
  assert.match(note, /door code stays off this paper/);
  assert.equal(text.includes('$'), false);
  assert.equal(/still opens the day before/i.test(text), false);
  assert.equal(/code\s*\d/i.test(text), false);
});
