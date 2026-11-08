import assert from 'node:assert/strict';
import test from 'node:test';
import { bookedDateLine, conciergeGuideAnswer, guideDeskAnswer, quotePageDateLine } from './guide-desk.ts';

test('a pet question does not invent a rule, and a party stays off the request', () => {
  const pets = guideDeskAnswer('Can we bring a dog?');
  assert.match(pets, /does not name a pet rule/);
  assert.match(pets, /will not invent one/);
  assert.match(pets, /does not send a message/);
  assert.equal(/allowed|no pets|\$/i.test(pets), false);
  const party = guideDeskAnswer('Can we have a party at the River House?');
  assert.match(party, /does not take a party or event without written approval/);
  assert.match(party, /does not send a message/);
  assert.equal(party.includes('Ranch'), false);
  assert.equal(party.includes('$'), false);
  const visitors = guideDeskAnswer('Can we have visitors?');
  assert.match(visitors, /The stay is for the guests on the booking/);
  assert.match(visitors, /This page does not change that count/);
  assert.match(visitors, /does not send a message/);
  assert.equal(/allowed|fee|charge|\$/i.test(visitors), false);
  const holiday = guideDeskAnswer('How long is Thanksgiving at the River House?', '2026-10-30');
  assert.match(holiday, /4 nights/);
  assert.equal(holiday.includes('does not take a party'), false);
});

test('the house guide desk answers from the published guide', () => {
  const checkout = guideDeskAnswer('When is checkout at the River House?');
  assert.match(checkout, /Checkout is 11:00 AM at The River House/);
  assert.match(checkout, /does not send a message/);
  assert.equal(checkout.includes('toilet paper'), false);

  const leaving = guideDeskAnswer('What do I do before checkout at the River House?');
  assert.match(leaving, /Only toilet paper/);
  assert.match(leaving, /Start the dishwasher/);
  assert.match(leaving, /does not send a message/);
  assert.equal(leaving.includes('$'), false);
  assert.equal(/door code|wi-?fi|password/i.test(leaving), false);
  const ranchLeave = guideDeskAnswer('Checkout steps at the Ranch House');
  assert.match(ranchLeave, /hot tub cover/);
  assert.equal(ranchLeave.includes('toilet paper'), false);
  const lindonLeave = guideDeskAnswer('What do I do before checkout at the Lindon House?');
  assert.match(lindonLeave, /Start the dishwasher/);
  assert.equal(lindonLeave.includes('toilet paper'), false);
  assert.equal(lindonLeave.toLowerCase().includes('hot tub'), false);

  const scoped = guideDeskAnswer('How many people can stay?', '2026-10-30', 'river');
  assert.match(scoped, /The River House sleeps 24/);
  assert.equal(scoped.includes('Ranch'), false);
  assert.equal(scoped.includes('Lindon'), false);
  const named = guideDeskAnswer('Does the Ranch House have a hot tub?', '2026-10-30', 'river');
  assert.match(named, /Keep the hot tub cover on/);
  assert.equal(named.includes('$'), false);
  const insured = guideDeskAnswer('Do you insure belongings?', '2026-10-30', 'river');
  assert.match(insured, /does not insure belongings, vehicles, or cash/);
  assert.match(insured, /does not send a message/);
  assert.equal(insured.includes('$'), false);
  const lease = guideDeskAnswer('Is this a lease?', '2026-10-30', 'lindon');
  assert.match(lease, /not a residential lease/);
  assert.match(lease, /The stay ends at checkout/);
  assert.match(lease, /does not send a message/);
  assert.equal(lease.includes('$'), false);
  const fireworks = guideDeskAnswer('Can we bring fireworks?', '2026-10-30', 'river');
  assert.match(fireworks, /No fireworks/);
  assert.match(fireworks, /No lifeguard is on duty/);
  assert.match(fireworks, /does not send a message/);
  assert.equal(fireworks.includes('$'), false);
  const cancel = guideDeskAnswer('Can a broken amenity cancel the stay?', '2026-10-30', 'ranch');
  assert.match(cancel, /does not cancel the stay unless the host agrees in writing/);
  assert.match(cancel, /without a refund for a serious rules violation/);
  assert.equal(cancel.includes('$'), false);
  const agreement = guideDeskAnswer('What does the stay agreement cover?', '2026-10-30', 'lindon');
  assert.match(agreement, /occupancy, damage, the house as-is, belongings, safety, a short stay rather than a lease, and a release/);
  assert.match(agreement, /does not sign it/);
  assert.match(agreement, /does not send a message/);
  assert.equal(agreement.toLowerCase().includes('hot tub'), false);
  assert.equal(agreement.toLowerCase().includes('river'), false);
  assert.equal(agreement.includes('$'), false);
  const riverAgreement = guideDeskAnswer('What does the stay agreement cover at the River House?');
  assert.match(riverAgreement, /the river/);
  assert.match(riverAgreement, /does not sign it/);
  const sleeps = guideDeskAnswer('How many people can stay?');
  assert.match(sleeps, /The River House sleeps 24/);
  assert.match(sleeps, /The Ranch House sleeps 20/);
  assert.match(sleeps, /The Lindon House sleeps 12/);
  const before = guideDeskAnswer('What should we do before arrival at the River House?');
  assert.match(before, /Winter driving/);
  assert.match(before, /These steps are from the published guide/);
  assert.match(before, /Nothing is sent/);
  assert.equal(before.includes('$'), false);
  assert.equal(before.includes('Ranch'), false);
  assert.match(guideDeskAnswer('When is check-in at the River House?'), /Check-in is 4:00 PM at The River House/);
  const many = guideDeskAnswer('Can 30 guests stay at the Ranch House?');
  assert.match(many, /The Ranch House sleeps 20/);
  assert.match(many, /larger than that house/);
  assert.match(many, /together sleep 44/);
  assert.match(many, /24 stay at the River House and 6 stay at the Ranch House/);
  assert.match(many, /Each house keeps an adult/);
  assert.equal(many.includes('The Lindon House'), false);
  assert.equal(many.includes('$'), false);
  assert.equal(/\bis open\b/.test(many), false);
  const kids = guideDeskAnswer('Do children count toward the guests?');
  assert.match(kids, /Children count toward the overnight guests/);
  assert.match(kids, /A stay needs an adult/);
  assert.equal(kids.includes('$'), false);
  assert.equal(/\bis open\b/.test(kids), false);
  const only = guideDeskAnswer('4 guests and 4 children');
  assert.match(only, /A stay needs an adult/);
  assert.match(only, /Children count toward the overnight guests/);
  assert.equal(only.includes('$'), false);
  const mixed = guideDeskAnswer('6 guests including 2 children');
  assert.match(mixed, /Children count toward the overnight guests/);
  assert.match(mixed, /This party fits/);
  assert.equal(mixed.includes('$'), false);

  const tub = guideDeskAnswer('Does the Ranch House have a hot tub?');
  assert.match(tub, /Keep the hot tub cover on/);
  const lindon = guideDeskAnswer('Does the Lindon House have a hot tub?');
  assert.match(lindon, /does not list a hot tub/);

  const first = guideDeskAnswer('When does the River House take its first stay?');
  assert.match(first, /November 1, 2026/);
  assert.doesNotMatch(first, /\bopen\b/);

  const beds = guideDeskAnswer('How many king suites at the Ranch House?');
  assert.match(beds, /does not list a bedroom count for The Ranch House/);
  const riverBeds = guideDeskAnswer('king suites at the river');
  assert.match(riverBeds, /Seven king suites/);
  const hours = guideDeskAnswer('How long is a same-day turn?');
  assert.match(hours, /5 hours, from 11:00 AM to 4:00 PM/);
  assert.match(hours, /makes it 2 hours/);
  const address = guideDeskAnswer('What is the address of the River House?');
  assert.match(address, /Vivian Park, Provo Canyon, Utah 84604/);
  assert.match(address, /does not send a message/);
  const past = guideDeskAnswer('Ranch check in 2026 10 01 check out 2026 10 03', '2026-10-30');
  assert.match(past, /The Ranch House: That check-in has already passed/);
  assert.equal(past.includes('$'), false);
  const clear = guideDeskAnswer('Lindon check in 2026 11 03 check out 2026 11 05', '2026-10-30');
  assert.match(clear, /does not fail a published stay rule/);
  assert.match(clear, /does not say the house is open/);
  const spoken = guideDeskAnswer('River November 13 to 15', '2026-10-30');
  assert.match(spoken, /does not fail a published stay rule/);
  assert.match(spoken, /does not say the house is open/);
  assert.equal(spoken.includes('$'), false);
  const oneNight = guideDeskAnswer('River November 13 to November 14', '2026-10-30');
  assert.match(oneNight, /at least 2 nights/);
  assert.match(oneNight, /through November 15, 2026, 2 nights/);
  const blockedShort = guideDeskAnswer(
    'River November 13 to November 14',
    '2026-10-30',
    'river',
    false,
    undefined,
    undefined,
    { taken: { river: ['2026-11-14'] }, closed: {} },
  );
  assert.match(blockedShort, /at least 2 nights/);
  assert.equal(blockedShort.includes('through November 15, 2026'), false);
  assert.equal(blockedShort.includes('$'), false);
  assert.equal(/\bis open\b/.test(blockedShort.replace(/does not say the house is open/gi, '')), false);
  assert.match(oneNight, /does not say the house is open/);
  assert.equal(oneNight.includes('$'), false);
  assert.equal(oneNight.replace(/does not say the house is open/gi, '').toLowerCase().includes('house is open'), false);
  const namedYear = guideDeskAnswer('Ranch October 1 2026 to October 3 2026', '2026-10-30');
  assert.match(namedYear, /That check-in has already passed/);
  const comps = guideDeskAnswer('How many fair sample comps sit within 10 miles of the River House?', '2026-10-30', undefined, true);
  assert.match(comps, /The River House:/);
  assert.match(comps, /within 10 miles/);
  assert.match(comps, /does not change the rate band/);
  assert.match(comps, /Nothing is posted/);
  assert.equal(comps.includes('$'), false);
  const hiddenComps = guideDeskAnswer(
    'How many fair sample comps sit within 10 miles of the River House?',
    '2026-10-30',
    undefined,
    true,
    undefined,
    { river: ['river-8'] },
  );
  assert.match(hiddenComps, /6 of 10 sample comps sleep close/);
  assert.equal(hiddenComps.includes('$'), false);
  assert.equal(/\bthe house is open\b/i.test(comps), false);
  const guestComps = guideDeskAnswer('How many fair sample comps sit within 10 miles?', '2026-10-30', undefined, false);
  assert.equal(/within 10 miles/.test(guestComps), false);
  const gaps = guideDeskAnswer('What sample amenities does the River House guide not list?', '2026-10-30', undefined, true);
  assert.match(gaps, /sample comps list an EV charger/);
  assert.match(gaps, /Our guide does not/);
  assert.match(gaps, /not live listings/);
  assert.match(gaps, /does not change the rate band/);
  assert.equal(gaps.includes('The Lindon House'), false);
  assert.equal(gaps.includes('$'), false);
  const guestGaps = guideDeskAnswer('What sample amenities does the River House guide not list?', '2026-10-30', undefined, false);
  assert.equal(/sample comps list/.test(guestGaps), false);
  const hiddenGap = guideDeskAnswer(
    'What sample amenities does the River House guide not list?',
    '2026-10-30',
    undefined,
    true,
    undefined,
    { river: ['river-1'] },
  );
  assert.match(hiddenGap, /8 of 10 sample comps list an EV charger/);
  assert.equal(hiddenGap.includes('$'), false);
  const pinnedGap = guideDeskAnswer(
    'What sample amenities does the River House guide not list?',
    '2026-10-30',
    undefined,
    true,
    undefined,
    undefined,
    undefined,
    undefined,
    { river: ['river-b1'] },
  );
  assert.match(pinnedGap, /8 of 10 sample comps list an EV charger/);
  assert.match(pinnedGap, /not live listings/);
  assert.equal(pinnedGap.includes('$'), false);
  const guestPinned = guideDeskAnswer(
    'What sample amenities does the River House guide not list?',
    '2026-10-30',
    undefined,
    false,
    undefined,
    undefined,
    undefined,
    undefined,
    { river: ['river-b1'] },
  );
  assert.equal(/sample comps list/.test(guestPinned), false);
  const broken = guideDeskAnswer('Can a broken amenity cancel the stay?', '2026-10-30', 'river', true);
  assert.match(broken, /does not cancel the stay unless the host agrees in writing/);
  assert.equal(/sample comps list/.test(broken), false);
  const quiet = guideDeskAnswer('Are quiet hours in effect right now at the Ranch House?', '2026-10-30', undefined, false, 23);
  assert.match(quiet, /in effect until 8:00 AM/);
  assert.match(quiet, /does not send a message/);
  const riverQuiet = guideDeskAnswer('Is it quiet hours now at the River House?', '2026-10-30', undefined, false, 23);
  assert.match(riverQuiet, /does not name a clock/);
  assert.equal(riverQuiet.includes('10'), false);
  assert.equal(quiet.includes('$') || riverQuiet.includes('$'), false);

  const refused = [
    guideDeskAnswer(''),
    guideDeskAnswer('What is the door code?'),
    guideDeskAnswer('What is the nightly rate?'),
    guideDeskAnswer('Who is staying next week?'),
    checkout,
    sleeps,
    tub,
    first,
    hours,
    address,
  ].join('\n');
  assert.equal(refused.includes('$'), false);
  assert.match(guideDeskAnswer('What is the door code?'), /stay off this desk/);
  assert.match(guideDeskAnswer('When does the door code open?'), /stay off this desk/);
  const phoneWhen = conciergeGuideAnswer('When does the door code open?', 'ranch', '2026-10-31', null, {
    checkIn: '2026-12-01',
    checkOut: '2026-12-04',
  });
  assert.match(phoneWhen ?? '', /November 30, 2026/);
  assert.match(phoneWhen ?? '', /Nothing is sent/);
  assert.equal(/code\s*\d/i.test(phoneWhen ?? ''), false);
  assert.match(guideDeskAnswer('What is the nightly rate?'), /does not quote a price/);
  assert.match(guideDeskAnswer('What is the management fee?'), /does not quote a price/);
  const split = guideDeskAnswer('What is the management fee?', '2026-10-30', undefined, true);
  assert.match(split, /20% management fee to Brandon first/);
  assert.match(split, /splits in half/);
  assert.match(split, /A loss after the fee splits the same way/);
  assert.match(split, /does not change a booking or a saved expense/);
  assert.match(split, /does not send a message/);
  assert.equal(split.includes('$'), false);
  const guard = guideDeskAnswer('Can we lower the published base?', '2026-10-30', undefined, true);
  assert.match(guard, /The published base is not lowered/);
  assert.match(guard, /Nothing is posted/);
  assert.equal(guard.includes('$'), false);
  assert.match(guideDeskAnswer('What is the nightly rate?', '2026-10-30', undefined, true), /does not quote a price/);
  assert.match(guideDeskAnswer('Lower the published base to 900', '2026-10-30', undefined, true), /does not quote a price/);
  assert.match(guideDeskAnswer('Who is staying next week?'), /published house guide/);
  const ski = guideDeskAnswer('Plan a ski day', '2026-10-30', 'river');
  assert.match(ski, /Sundance Mountain Resort/);
  assert.match(ski, /Winter driving/);
  assert.match(ski, /does not send a message/);
  assert.equal(ski.includes('$'), false);
  assert.equal(ski.includes('Ranch'), false);
  const outdoors = guideDeskAnswer('Plan an outdoors day at the River House', '2026-10-30');
  assert.match(outdoors, /An outdoors day/);
  assert.match(outdoors, /Provo River tubing and rafting/);
  assert.match(outdoors, /This day has no price/);
  assert.match(outdoors, /does not send a message/);
  assert.equal(outdoors.includes('$'), false);
  assert.equal(outdoors.includes('Ranch'), false);
  const sunday = guideDeskAnswer('What is the Sunday note at the Ranch House?', '2026-10-30');
  assert.match(sunday, /Sunday/);
  assert.match(sunday, /Most local restaurants close on Sundays/);
  assert.match(sunday, /This day has no price/);
  assert.equal(sunday.includes('$'), false);
  assert.equal(sunday.includes('River'), false);
  const where = guideDeskAnswer('Where is Sundance?', '2026-10-30', 'river');
  assert.match(where, /Sundance Mountain Resort/);
  assert.equal(where.includes('$'), false);
  const groceries = guideDeskAnswer('Where are groceries?', '2026-10-30', 'river');
  assert.match(groceries, /Orem/);
  assert.match(groceries, /does not send a message/);
  assert.equal(groceries.includes('$'), false);
  const stay = conciergeGuideAnswer('When is checkout?', 'river', '2026-10-30');
  const closedStay = conciergeGuideAnswer('November 16 to 18', 'ranch', '2026-10-31', {
    taken: {},
    closed: { ranch: ['2026-11-16'] },
  });
  assert.match(closedStay ?? '', /Those nights are closed on the calendar/);
  assert.equal((closedStay ?? '').includes('$'), false);
  assert.equal((conciergeGuideAnswer('November 16 to 18', 'ranch', '2026-10-31') ?? '').includes('closed on the calendar'), false);
  const waiting = conciergeGuideAnswer('November 16 to 18', 'ranch', '2026-10-31', null, undefined, undefined, true);
  assert.match(waiting ?? '', /Checking the calendar/);
  assert.match(waiting ?? '', /Nothing is sent/);
  assert.equal((waiting ?? '').includes('does not fail a published stay rule'), false);
  assert.equal((waiting ?? '').includes('$'), false);
  assert.equal((waiting ?? '').includes('is open'), false);
  assert.match(stay ?? '', /Checkout is 11:00 AM at The River House/);
  assert.match(stay ?? '', /does not send a message/);
  assert.equal((stay ?? '').includes('Ranch'), false);
  assert.equal((stay ?? '').includes('$'), false);
  const smoking = conciergeGuideAnswer('Is smoking allowed?', 'ranch', '2026-10-31', null, {
    checkIn: '2026-12-01',
    checkOut: '2026-12-04',
  });
  assert.match(smoking ?? '', /No smoking indoors/);
  assert.match(smoking ?? '', /Nothing is sent/);
  assert.equal((smoking ?? '').includes('No parties'), false);
  assert.notEqual(smoking, null);
  const swim = conciergeGuideAnswer('Can we swim in the river?', 'ranch', '2026-10-31', null, {
    checkIn: '2026-12-01',
    checkOut: '2026-12-04',
  });
  assert.match(swim ?? '', /The Ranch House is in Lindon/);
  assert.equal((swim ?? '').includes('cold and fast'), false);
  assert.notEqual(swim, null);
  const riverSwim = guideDeskAnswer('Can we swim?', '2026-10-31', 'river');
  assert.match(riverSwim, /Deer Creek Reservoir/);
  assert.match(riverSwim, /cold and fast/);
  assert.equal(riverSwim.includes('$'), false);
  const riverSafe = guideDeskAnswer('Is the river safe?', '2026-10-31', 'river');
  assert.match(riverSafe, /cold and fast/);
  assert.equal(riverSafe.includes('Deer Creek'), false);
  const ranchSafe = conciergeGuideAnswer('Is the river safe?', 'ranch', '2026-10-31', null, {
    checkIn: '2026-12-01',
    checkOut: '2026-12-04',
  });
  assert.match(ranchSafe ?? '', /does not name the river/);
  assert.equal((ranchSafe ?? '').includes('cold and fast'), false);
  const fire = guideDeskAnswer('Can we have a fire?', '2026-10-31', 'ranch');
  assert.match(fire, /call 911 first/);
  assert.equal(fire.includes('fireplace'), false);
  const parked = conciergeGuideAnswer('Where should we park?', 'ranch', '2026-10-31', null, {
    checkIn: '2026-12-01',
    checkOut: '2026-12-04',
  });
  assert.match(parked ?? '', /driveway/);
  assert.equal((parked ?? '').includes('Park City'), false);
  assert.equal(conciergeGuideAnswer('Who is staying next week?', 'ranch', '2026-10-30'), null);
  const coded = conciergeGuideAnswer('What is the door code?', 'lindon', '2026-10-30') ?? '';
  assert.match(coded, /stay off this desk/);
  assert.equal(/code\s*\d/.test(coded), false);
  const thisStay = conciergeGuideAnswer('When do we arrive?', 'ranch', '2026-10-31', null, {
    checkIn: '2026-12-01',
    checkOut: '2026-12-04',
  });
  assert.match(thisStay ?? '', /December 1, 2026/);
  assert.match(thisStay ?? '', /4:00 PM/);
  assert.match(thisStay ?? '', /Lindon/);
  assert.equal((thisStay ?? '').includes('$'), false);
  assert.equal(/door\s*code|wi-?fi|password/i.test(thisStay ?? ''), false);
  const noraQuiet = conciergeGuideAnswer('Are quiet hours in effect right now?', 'river', '2026-10-31', null, {
    checkIn: '2026-12-01',
    checkOut: '2026-12-04',
  }, 23);
  assert.match(noraQuiet ?? '', /does not name a clock/);
  assert.equal((noraQuiet ?? '').includes('10 PM'), false);
  assert.equal((noraQuiet ?? '').includes('$'), false);
});

test('one check-in names the lengths the rate card can quote', () => {
  const river = guideDeskAnswer('How long can a stay start at the River House on November 13?', '2026-10-30');
  assert.match(river, /2 nights/);
  assert.match(river, /4 nights/);
  assert.match(river, /November 13, 2026/);
  assert.match(river, /Nothing is charged yet/);
  assert.match(river, /does not send a message/);
  assert.equal(river.includes('$'), false);
  assert.equal(river.replace(/does not say the house is open/gi, '').toLowerCase().includes('house is open'), false);
  const closed = guideDeskAnswer('How long can a stay start at the River House on October 30?', '2026-10-30');
  assert.match(closed, /does not quote a stay from October 30, 2026/);
  assert.equal(closed.includes('$'), false);
  const blocked = guideDeskAnswer(
    'How long can a stay start at the River House on November 1?',
    '2026-10-30',
    'river',
    false,
    undefined,
    undefined,
    { taken: { river: ['2026-11-02'] }, closed: {} },
  );
  assert.match(blocked, /does not quote a stay from November 1, 2026/);
  assert.equal(blocked.includes('2 nights'), false);
  assert.equal(blocked.includes('$'), false);
  assert.equal(/\bis open\b/.test(blocked), false);
  const heldNight = guideDeskAnswer(
    'How long can a stay start at the River House on November 1?',
    '2026-10-30',
    'river',
    false,
    undefined,
    undefined,
    { taken: {}, closed: { river: ['2026-11-01'] } },
  );
  assert.match(heldNight, /closed on the calendar/);
  assert.equal(heldNight.includes('$'), false);
  const span = guideDeskAnswer('How long is November 13 to 15 at the River House?', '2026-10-30');
  assert.equal(span.includes('14 nights'), false);
  assert.equal(span.includes('$'), false);
});

test('a named event names the shortest stay and does not quote a price', () => {
  const thanks = guideDeskAnswer('How many nights is Thanksgiving at the River House?', '2026-10-30');
  assert.match(thanks, /4 nights/);
  assert.match(thanks, /Nothing is charged yet/);
  assert.match(thanks, /does not send a message/);
  assert.equal(thanks.includes('$'), false);
  assert.equal(thanks.replace(/does not say the house is open/gi, '').toLowerCase().includes('house is open'), false);
  const asu = guideDeskAnswer('How many nights is Arizona State at the River House?', '2026-10-30');
  assert.match(asu, /not on that event/);
  assert.equal(asu.includes('$'), false);
  const ranch = guideDeskAnswer('How many nights is Arizona State at the Ranch House?', '2026-10-30');
  assert.match(ranch, /1 night/);
  assert.equal(ranch.includes('Lindon'), false);
  const where = guideDeskAnswer('Where is Sundance?', '2026-10-30', 'river');
  assert.match(where, /Sundance Mountain Resort/);
  assert.equal(where.includes('4 nights'), false);
});

test('a booked event start stays off the guide answer', () => {
  const taken = ['2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28'];
  const calendar = { taken: { ranch: taken, lindon: [], river: [] }, closed: { ranch: [], lindon: [], river: [] } };
  const ranch = guideDeskAnswer('How many nights is Thanksgiving at the Ranch House?', '2026-10-31', 'ranch', false, undefined, undefined, calendar);
  assert.match(ranch, /already booked/);
  assert.equal(ranch.includes('can quote'), false);
  assert.equal(ranch.includes('$'), false);
  assert.match(ranch, /does not send a message/);
  const river = guideDeskAnswer('How many nights is Thanksgiving at the River House?', '2026-10-31', 'river', false, undefined, undefined, calendar);
  assert.match(river, /4 nights/);
  assert.equal(river.includes('already booked'), false);
});

test('the desk lists upcoming events and does not quote a price', () => {
  const list = guideDeskAnswer('What events are coming up?', '2026-10-30');
  assert.match(list, /Baylor/);
  assert.match(list, /Thanksgiving/);
  assert.match(list, /The River House is not on this event/);
  assert.match(list, /Nothing is charged yet/);
  assert.match(list, /does not send a message/);
  assert.equal(list.includes('$'), false);
  assert.equal(list.replace(/does not say a house is open/gi, '').toLowerCase().includes('house is open'), false);
  const next = guideDeskAnswer('What is the next event?', '2026-10-30');
  assert.match(next, /Arizona State/);
  assert.equal(next.includes('Christmas'), false);
  const party = guideDeskAnswer('Can we have events at the River House?', '2026-10-30');
  assert.match(party, /written approval/);
  assert.equal(party.includes('Thanksgiving'), false);
});

test('the desk names the rate-card week and does not quote a price', () => {
  const week = guideDeskAnswer('What is the rate card week?', '2026-10-30');
  assert.match(week, /River:/);
  assert.match(week, /Ranch:/);
  assert.match(week, /Lindon:/);
  assert.match(week, /Nothing is raised/);
  assert.match(week, /does not send a message/);
  assert.match(week, /does not say which nights are booked or open/);
  assert.equal(week.includes('$'), false);
  const marked = guideDeskAnswer('What is the rate card week?', '2026-10-30', undefined, false, undefined, undefined, {
    taken: { ranch: ['2026-10-30'] },
    closed: {},
  });
  assert.match(marked, /Ranch: booked/);
  assert.match(marked, /Booked nights and calendar blocks are marked/);
  assert.equal(marked.includes('$'), false);
  assert.equal(/\bopen\b/i.test(marked), false);
  const price = guideDeskAnswer('What is the nightly rate?');
  assert.match(price, /does not quote a price/);
  assert.equal(price.includes('River:'), false);
});

test('a date question names a booked night and does not say the house is open', () => {
  const booked = guideDeskAnswer('November 25 to 27 at the Ranch House', '2026-10-31', 'ranch', false, undefined, undefined, {
    taken: { ranch: ['2026-11-25'] },
    closed: {},
  });
  assert.match(booked, /Those nights are already booked/);
  assert.equal(booked.includes('$'), false);
  assert.equal(/\bis open\b/.test(booked), false);
  const closed = guideDeskAnswer('November 25 to 27 at the Ranch House', '2026-10-31', 'ranch', false, undefined, undefined, {
    taken: { ranch: ['2026-11-25'] },
    closed: { ranch: ['2026-11-25'] },
  });
  assert.match(closed, /Those nights are closed on the calendar/);
  const onlyClosed = guideDeskAnswer('November 16 to 18 at the Ranch House', '2026-10-31', 'ranch', false, undefined, undefined, {
    taken: {},
    closed: { ranch: ['2026-11-16'] },
  });
  assert.match(onlyClosed, /Those nights are closed on the calendar/);
  assert.equal(onlyClosed.includes('$'), false);
  assert.equal(/\bis open\b/.test(onlyClosed), false);
  const onlySearch = bookedDateLine('November 16 to 18', 'ranch', '2026-10-31', {
    taken: {},
    closed: { ranch: ['2026-11-16'] },
  });
  assert.match(onlySearch ?? '', /Those nights are closed on the calendar/);
  assert.equal((onlySearch ?? '').includes('$'), false);
  const unread = guideDeskAnswer('November 25 to 27 at the Ranch House', '2026-10-31', 'ranch');
  assert.equal(unread.includes('already booked'), false);
  const search = bookedDateLine('November 25 to 27', 'ranch', '2026-10-31', {
    taken: { ranch: ['2026-11-25'] },
    closed: {},
  });
  assert.match(search ?? '', /Those nights are already booked/);
  assert.match(search ?? '', /does not send a message/);
  assert.equal(bookedDateLine('November 16 to 18', 'ranch', '2026-10-31', { taken: { ranch: ['2026-11-25'] }, closed: {} }), null);
  assert.equal(bookedDateLine('November 25 to 27', 'ranch', '2026-10-31', null), null);
  assert.equal(bookedDateLine('septic', 'ranch', '2026-10-31', { taken: { ranch: ['2026-11-25'] }, closed: {} }), null);
});

test('a directions question stays on the published address and arrival note', () => {
  const desk = guideDeskAnswer('How do I get there?', '2026-10-31', 'ranch');
  assert.match(desk, /270 East Center Street, Lindon, Utah 84042/);
  assert.match(desk, /45 minutes south of the Salt Lake airport/);
  assert.match(desk, /does not send a message/);
  assert.equal(desk.includes('$'), false);
  assert.equal(/only answers from the published house guide/.test(desk), false);
  const nora = conciergeGuideAnswer('How do I get there?', 'river', '2026-10-31', null, {
    checkIn: '2026-12-01',
    checkOut: '2026-12-04',
  });
  assert.match(nora ?? '', /Vivian Park, Provo Canyon/);
  assert.match(nora ?? '', /Drive up Provo Canyon/);
  assert.equal((nora ?? '').includes('$'), false);
  const airport = guideDeskAnswer('How far is the airport?', '2026-10-31', 'ranch');
  assert.match(airport, /45 minutes south of the Salt Lake airport/);
  assert.match(airport, /does not send a message/);
  assert.equal(airport.includes('$'), false);
  const riverAirport = guideDeskAnswer('How far is the airport?', '2026-10-31', 'river');
  assert.match(riverAirport, /does not name the airport/);
  assert.equal(riverAirport.includes('45 minutes'), false);
  const sunday = guideDeskAnswer('Are restaurants open on Sunday?', '2026-10-31', 'ranch');
  assert.match(sunday, /close on Sundays/);
  assert.equal(/\bis open\b/.test(sunday), false);
  const parking = guideDeskAnswer('Where do I park at the Ranch House?', '2026-10-31', 'ranch');
  assert.match(parking, /driveway/);
  assert.equal(parking.includes('270 East Center'), false);
});

test('a named event on the house guide follows both calendars for a two-house party', () => {
  const calendar = {
    taken: { ranch: ['2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28'], river: [], lindon: [] },
    closed: { ranch: [], river: [], lindon: [] },
  };
  const page = { checkIn: '2026-12-01', checkOut: '2026-12-04', guests: 30 };
  const thanks = guideDeskAnswer('How long is Thanksgiving?', '2026-11-04', 'river', false, undefined, undefined, calendar, page);
  assert.match(thanks, /already booked/);
  assert.equal(thanks.includes('4 nights'), false);
  assert.equal(thanks.includes('$'), false);
  const baylor = guideDeskAnswer('How many nights is BYU vs Baylor?', '2026-11-04', 'river', false, undefined, undefined, calendar, page);
  assert.match(baylor, /Both houses can quote/);
  const one = guideDeskAnswer('How long is Thanksgiving?', '2026-11-04', 'river', false, undefined, undefined, calendar, { ...page, guests: 4 });
  assert.match(one, /4 nights/);
});

test('a house guide early or late question follows both calendars for a two-house party', () => {
  const calendar = { taken: { ranch: ['2026-12-18'], river: [], lindon: [] }, closed: { ranch: [], river: [], lindon: [] } };
  const page = { checkIn: '2026-12-15', checkOut: '2026-12-18', guests: 30 };
  const early = guideDeskAnswer('Can we arrive at 1?', '2026-11-07', 'river', false, undefined, undefined, calendar, page);
  assert.match(early, /request for both houses/);
  assert.equal(early.includes('$'), false);
  assert.equal(/door code still opens/i.test(early), false);
  const late = guideDeskAnswer('Can we leave at 2?', '2026-11-07', 'river', false, undefined, undefined, calendar, page);
  assert.match(late, /not open for both houses/);
  assert.equal(late.includes('$'), false);
  const one = guideDeskAnswer('Can we arrive at 1?', '2026-11-07', 'river', false, undefined, undefined, calendar, {
    ...page,
    guests: 4,
  });
  assert.match(one, /request/);
  assert.equal(/both houses/.test(one), false);
});

test('an early arrival question names the request and does not send', () => {
  const nora = conciergeGuideAnswer('Can we arrive early?', 'ranch', '2026-10-31', { taken: { ranch: [] }, closed: { ranch: [] } }, {
    checkIn: '2026-11-16',
    checkOut: '2026-11-18',
  });
  assert.match(nora ?? '', /Arrive at 1:00 PM is a request/);
  assert.match(nora ?? '', /Nothing is sent/);
  assert.equal((nora ?? '').includes('$'), false);
  assert.equal(/only answers from the published house guide/.test(nora ?? ''), false);
  const held = conciergeGuideAnswer('Can we arrive early?', 'ranch', '2026-10-31', { taken: { ranch: ['2026-11-28'] }, closed: { ranch: [] } }, {
    checkIn: '2026-11-29',
    checkOut: '2026-12-01',
  });
  assert.match(held ?? '', /not open for this stay/);
  const bothEarly = conciergeGuideAnswer(
    'Can we arrive early?',
    'river',
    '2026-11-07',
    { taken: { river: [], ranch: [], lindon: [] }, closed: {} },
    { checkIn: '2026-12-01', checkOut: '2026-12-04' },
    undefined,
    false,
    { guests: 30, children: 0 },
  );
  assert.match(bothEarly ?? '', /request for both houses/);
  const bothDates = conciergeGuideAnswer(
    'Can we book these dates?',
    'river',
    '2026-11-04',
    { taken: { river: [], ranch: [], lindon: [] }, closed: {} },
    { checkIn: '2026-12-01', checkOut: '2026-12-04' },
    undefined,
    false,
    { guests: 30 },
  );
  assert.match(bothDates ?? '', /24 stay at the River House and 6 stay at the Ranch House/);
  assert.equal((bothDates ?? '').includes('$'), false);
  const desk = guideDeskAnswer('Can we arrive early?', '2026-10-31', 'ranch');
  assert.match(desk, /night before has to be clear/);
  assert.match(desk, /does not send a message/);
  assert.equal(desk.includes('$'), false);
});

test('a winter driving question stays on the published River lines', () => {
  const river = guideDeskAnswer('Do we need 4WD in the snow?', '2026-10-31', 'river');
  assert.match(river, /AWD or 4WD in winter/);
  assert.match(river, /does not send a message/);
  assert.equal(river.includes('$'), false);
  const ranch = guideDeskAnswer('Do we need 4WD?', '2026-10-31', 'ranch');
  assert.match(ranch, /does not name a winter driving rule/);
  assert.equal(ranch.includes('Provo Canyon'), false);
  const all = guideDeskAnswer('What about snow?');
  assert.match(all, /AWD or 4WD in winter/);
  assert.match(all, /do not name a winter driving rule/);
});

test('a meal question stays on the published food list', () => {
  const ranch = guideDeskAnswer('Where should we eat?', '2026-10-31', 'ranch');
  assert.match(ranch, /Oteo/);
  assert.match(ranch, /does not send a message/);
  assert.equal(ranch.includes('$'), false);
  assert.equal(/\bis open\b/.test(ranch), false);
  const ski = guideDeskAnswer('Where should we ski?', '2026-10-31', 'ranch');
  assert.match(ski, /Sundance/);
  assert.equal(ski.includes('Oteo'), false);
  const hike = guideDeskAnswer('Where can we hike?', '2026-10-31', 'ranch');
  assert.match(hike, /Bridal Veil Falls/);
  assert.equal(hike.includes('Oteo'), false);
  assert.match(hike, /does not send a message/);
  const kids = guideDeskAnswer('Where can the kids go?', '2026-10-31', 'ranch');
  assert.match(kids, /Thanksgiving Point/);
  assert.equal(kids.includes('$'), false);
  const riverStore = guideDeskAnswer('Where can we get groceries?', '2026-10-31', 'river');
  assert.match(riverStore, /Vivian Park/);
  assert.match(riverStore, /does not send a message/);
  assert.equal(riverStore.includes('$'), false);
  const ranchStore = guideDeskAnswer('Where can we get groceries?', '2026-10-31', 'ranch');
  assert.match(ranchStore, /does not name a grocery store/);
  assert.equal(ranchStore.includes('Oteo'), false);
});

test('these dates use the stay on the page', () => {
  const page = { checkIn: '2026-11-06', checkOut: '2026-11-08' };
  const pending = guideDeskAnswer('Can we book these dates?', '2026-10-31', undefined, false, undefined, undefined, null, {
    ...page,
    pending: true,
  });
  assert.match(pending, /Checking the calendar/);
  assert.equal(/\bis open\b/.test(pending), false);
  assert.equal(pending.includes('$'), false);
  const unread = guideDeskAnswer('Can we book these dates?', '2026-10-31', undefined, false, undefined, undefined, null, page);
  assert.match(unread, /could not be read/);
  assert.equal(/\bquote\b/i.test(unread), false);
  const live = guideDeskAnswer(
    'Can we book these dates?',
    '2026-10-31',
    undefined,
    false,
    undefined,
    undefined,
    { taken: { lindon: ['2026-11-06'], river: [], ranch: [] }, closed: {} },
    page,
  );
  assert.match(live, /The River House: These dates can be quoted/);
  assert.match(live, /The Ranch House: These dates can be quoted/);
  assert.match(live, /The Lindon House: Those nights are already booked/);
  assert.equal(live.includes('$'), false);
  assert.equal(/\bis open\b/.test(live), false);
  assert.match(live, /does not send a message/);
  const both = guideDeskAnswer(
    'Can we book these dates?',
    '2026-11-04',
    undefined,
    false,
    undefined,
    undefined,
    { taken: { river: [], ranch: [], lindon: [] }, closed: {} },
    { checkIn: '2026-12-01', checkOut: '2026-12-04', guests: 30 },
  );
  assert.match(both, /24 stay at the River House and 6 stay at the Ranch House/);
  assert.equal(both.includes('The River House: These dates can be quoted'), false);
  assert.equal(both.includes('$'), false);
  const one = guideDeskAnswer(
    'Are these nights free?',
    '2026-10-31',
    'lindon',
    false,
    undefined,
    undefined,
    { taken: { lindon: ['2026-11-06'] }, closed: {} },
    page,
  );
  assert.match(one, /The Lindon House: Those nights are already booked/);
  assert.equal(one.includes('River'), false);
  const park = guideDeskAnswer('Where should we park these nights?', '2026-10-31', 'ranch', false, undefined, undefined, { taken: {}, closed: {} }, page);
  assert.match(park, /driveway/i);
  assert.equal(park.includes('already booked'), false);
  const quoted = quotePageDateLine('Can we book these dates?', 'river', '2026-11-06', '2026-11-08', { taken: { river: [] }, closed: {} }, '2026-10-31');
  assert.equal(quoted, 'The River House: These dates can be quoted. Nothing is sent.');
  const bookedNight = quotePageDateLine('Can we book these dates?', 'lindon', '2026-11-06', '2026-11-08', { taken: { lindon: ['2026-11-06'] }, closed: {} }, '2026-10-31');
  assert.match(bookedNight ?? '', /Those nights are already booked/);
  assert.match(bookedNight ?? '', /Nothing is sent/);
  assert.equal((bookedNight ?? '').includes('$'), false);
  assert.equal(/\bis open\b/.test(bookedNight ?? ''), false);
  const waiting = quotePageDateLine('Can we book these dates?', 'river', '2026-11-06', '2026-11-08', null, '2026-10-31', true);
  assert.equal(waiting, 'Checking the calendar. Nothing is sent.');
  const parkQuote = quotePageDateLine('Where should we park these nights?', 'ranch', '2026-11-06', '2026-11-08', { taken: {}, closed: {} }, '2026-10-31');
  assert.equal(parkQuote, null);
});

test('a checkout question uses the published step', () => {
  const trash = guideDeskAnswer('Where do we put the trash?', '2026-11-04', 'ranch');
  assert.match(trash, /Take kitchen trash to the outside bins/);
  assert.match(trash, /does not send a message/);
  assert.equal(trash.includes('$'), false);
  assert.equal(/door\s*code|wi-?fi|password/i.test(trash), false);
  const towels = guideDeskAnswer('Where should we put the towels tonight?', '2026-11-04', 'river');
  assert.match(towels, /used towels in the laundry room/);
  assert.equal(/trash|fireplace|dishwasher/i.test(towels), false);
});
