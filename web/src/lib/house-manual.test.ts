import assert from 'node:assert/strict';
import test from 'node:test';
import { dateThisStay, emergencyLine, flexStayLine, guideClockHits, guideDirectionHits, guideNearbyHits, houseManual, hotTubLine, keepClockLines, keepParkingLines, manualGapLine, publicFlexLine, searchHouseManual, smokingRuleLine, stayGuideLookup, swimFacts, winterDriveLine } from './house-manual.ts';

test('the house guide search stays on published lines', () => {
  const river = houseManual('river').map((hit) => `${hit.title} ${hit.text}`).join('\n');
  assert.match(river, /Only toilet paper/);
  assert.match(river, /Sundance Mountain Resort/);
  assert.equal(river.includes('$'), false);
  assert.equal(/door\s*code|wi-?fi|password/i.test(river), false);
  assert.equal(houseManual('lindon').some((hit) => /hot tub/i.test(hit.text)), false);

  const septic = searchHouseManual('septic', ['river']);
  assert.equal(septic.hits.length > 0, true);
  assert.equal(septic.hits.every((hit) => hit.house === 'river'), true);
  assert.match(septic.hits.map((hit) => hit.text).join(' '), /toilet paper/);

  const ski = searchHouseManual('Where is Sundance?', ['river']);
  assert.match(ski.hits[0]?.title ?? '', /Sundance/);
  assert.equal(ski.hits.some((hit) => hit.house !== 'river'), false);

  const groceries = searchHouseManual('groceries', ['river']);
  assert.match(groceries.hits.map((hit) => `${hit.title} ${hit.text}`).join(' '), /Orem/);
  assert.equal(searchHouseManual('groceries', ['lindon']).hits.length, 0);

  const tub = searchHouseManual('hot tub', ['river']);
  assert.equal(tub.hits.length, 0);
  const ranchTub = searchHouseManual('hot tub', ['ranch']);
  assert.match(ranchTub.hits.map((hit) => hit.text).join(' '), /cover/);

  const address = searchHouseManual('What is the address?', ['ranch']);
  assert.equal(address.hits[0]?.title, 'Address');
  assert.match(address.hits[0]?.text ?? '', /270 East Center Street, Lindon, Utah 84042/);
  assert.equal((address.hits[0]?.text ?? '').includes('$'), false);
  const riverAddress = stayGuideLookup('What is the address?', 'river', { checkIn: '2026-12-01', checkOut: '2026-12-04' });
  assert.equal(riverAddress.kind, 'hits');
  assert.match(riverAddress.hits.map((hit) => `${hit.title} ${hit.text}`).join(' '), /Vivian Park, Provo Canyon/);
  assert.equal(riverAddress.hits.some((hit) => hit.text.includes('$')), false);
  assert.equal(/This stay checks in/.test(riverAddress.hits.map((hit) => hit.text).join(' ')), false);

  const dog = manualGapLine('Can we bring a dog?');
  assert.match(dog ?? '', /does not name a pet rule/);
  assert.match(dog ?? '', /will not invent one/);
  assert.match(dog ?? '', /Nothing is sent/);
  assert.equal(/allowed|no pets|\$/i.test(dog ?? ''), false);
  const many = manualGapLine('Can 30 guests stay?', 'ranch');
  assert.match(many ?? '', /The Ranch House sleeps 20/);
  assert.match(many ?? '', /together sleep 44/);
  assert.match(many ?? '', /Nothing is sent/);
  assert.equal((many ?? '').includes('The Lindon House'), false);
  assert.equal((many ?? '').includes('$'), false);
  const kids = manualGapLine('Do children count?');
  assert.match(kids ?? '', /Children count toward the overnight guests/);
  assert.match(kids ?? '', /A stay needs an adult/);
  assert.match(kids ?? '', /Nothing is sent/);
  assert.equal((kids ?? '').includes('$'), false);
  assert.equal(/\bis open\b/.test(kids ?? ''), false);
  const only = manualGapLine('4 guests and 4 children', 'ranch');
  assert.match(only ?? '', /A stay needs an adult/);
  assert.match(only ?? '', /The Ranch House sleeps 20/);
  assert.equal((only ?? '').includes('$'), false);
  assert.equal(manualGapLine('septic'), null);
  const insured = manualGapLine('Do you insure belongings?');
  assert.match(insured ?? '', /does not insure belongings, vehicles, or cash/);
  assert.match(insured ?? '', /Nothing is sent/);
  assert.equal((insured ?? '').includes('$'), false);
  const lease = manualGapLine('Is this a lease?');
  assert.match(lease ?? '', /not a residential lease/);
  assert.match(lease ?? '', /Nothing is sent/);
  assert.equal((lease ?? '').includes('$'), false);
  const fireworks = manualGapLine('Can we bring fireworks?');
  assert.match(fireworks ?? '', /No fireworks/);
  assert.match(fireworks ?? '', /Nothing is sent/);
  assert.equal((fireworks ?? '').includes('$'), false);
  const cancel = manualGapLine('Can a broken amenity cancel the stay?');
  assert.match(cancel ?? '', /does not cancel the stay unless the host agrees in writing/);
  assert.equal((cancel ?? '').includes('$'), false);
  assert.equal(searchHouseManual('Who is staying next week?', ['ranch']).hits.length, 0);
  const trash = searchHouseManual('What should we do with the trash?', ['ranch']);
  assert.equal(trash.hits.some((hit) => hit.text.includes('kitchen trash')), true);
  assert.equal(trash.hits.every((hit) => hit.text.includes('kitchen trash')), true);
  assert.equal(trash.hits.some((hit) => hit.text.includes('towel')), false);
  assert.equal(trash.hits.some((hit) => hit.text.includes('$')), false);
  const dishes = searchHouseManual('How does the dishwasher work?', ['ranch']);
  assert.equal(dishes.hits.some((hit) => /dishwasher/i.test(`${hit.title} ${hit.text}`)), true);
  assert.equal(dishes.hits.every((hit) => /dishwasher/i.test(hit.text)), true);
  assert.equal(searchHouseManual('Is there a washer?', ['ranch']).hits.length, 0);
  const towels = stayGuideLookup('Where are the towels?', 'ranch');
  assert.equal(towels.kind, 'hits');
  assert.match(towels.hits.map((hit) => hit.text).join(' '), /used towels in the laundry room/);
  assert.equal(towels.hits.some((hit) => /trash|fireplace|dishwasher/i.test(hit.text)), false);
  const leaving = stayGuideLookup('What should we do before we leave?', 'ranch');
  assert.equal(leaving.kind, 'hits');
  assert.equal(leaving.hits.filter((hit) => hit.title === 'Before you leave').length > 1, true);
  assert.equal(leaving.hits.some((hit) => /This stay checks out/.test(hit.text)), false);
  assert.equal(searchHouseManual('Is there a hair dryer?', ['ranch']).hits.length, 0);
  assert.equal(searchHouseManual('', ['river']).hits.length, 0);
  const joined = [...septic.hits, ...ski.hits, ...ranchTub.hits].map((hit) => `${hit.title} ${hit.text}`).join('\n');
  assert.equal(joined.includes('$'), false);
  assert.equal(/\bthe house is open\b/i.test(joined), false);
});

test('the stay phone searches the published guide and leaves the door code off', () => {
  const parking = stayGuideLookup('Where do we park?', 'ranch');
  assert.equal(parking.kind, 'hits');
  assert.match(parking.hits.map((hit) => hit.text).join(' '), /driveway/i);
  assert.equal(parking.hits.every((hit) => hit.title === 'Parking'), true);
  assert.equal(parking.hits.every((hit) => hit.house === 'ranch'), true);
  assert.equal(parking.hits.map((hit) => `${hit.title} ${hit.text}`).join(' ').includes('Park City'), false);
  assert.equal(parking.hits.map((hit) => `${hit.title} ${hit.text}`).join(' ').includes('$'), false);
  const riverPark = keepParkingLines('Where should we park?', searchHouseManual('Where should we park?', ['river']));
  assert.equal(riverPark.hits.every((hit) => hit.title === 'Parking'), true);
  assert.match(riverPark.hits.map((hit) => hit.text).join(' '), /garage/);
  assert.equal(riverPark.hits.map((hit) => hit.title).join(' ').includes('Park City'), false);
  const resort = keepParkingLines('Where is Park City?', searchHouseManual('Where is Park City?', ['ranch']));
  assert.equal(resort.hits.some((hit) => hit.title.includes('Park City')), true);
  const smoke = smokingRuleLine('Is smoking allowed?', 'ranch');
  assert.match(smoke ?? '', /No smoking indoors/);
  assert.equal((smoke ?? '').includes('No parties'), false);
  assert.equal((smoke ?? '').includes('$'), false);
  const riverSmoke = stayGuideLookup('Is smoking allowed?', 'river');
  assert.equal(riverSmoke.kind, 'gap');
  assert.match(riverSmoke.text, /No smoking indoors/);
  assert.match(riverSmoke.text, /Nothing is sent/);
  assert.equal(riverSmoke.text.includes('No parties'), false);
  const ranchSwim = stayGuideLookup('Can we swim in the river?', 'ranch');
  assert.equal(ranchSwim.kind, 'gap');
  assert.match(ranchSwim.text, /The Ranch House is in Lindon/);
  assert.match(ranchSwim.text, /does not name a place to swim/);
  assert.match(ranchSwim.text, /Nothing is sent/);
  assert.equal(ranchSwim.text.includes('cold and fast'), false);
  assert.equal(ranchSwim.text.includes('$'), false);
  const riverSwim = swimFacts('Can we swim?', 'river') ?? '';
  assert.match(riverSwim, /cold and fast/);
  assert.match(riverSwim, /Deer Creek Reservoir/);
  assert.match(riverSwim, /swimming in summer/);
  assert.equal(riverSwim.includes('$'), false);
  const riverSafe = stayGuideLookup('Is the river safe?', 'river');
  assert.match(riverSafe.text, /cold and fast/);
  assert.equal(riverSafe.text.includes('Deer Creek'), false);
  assert.match(riverSafe.text, /Nothing is sent/);
  const ranchSafe = stayGuideLookup('Is the river safe?', 'ranch');
  assert.match(ranchSafe.text, /The Ranch House is in Lindon/);
  assert.match(ranchSafe.text, /does not name the river/);
  assert.equal(ranchSafe.text.includes('cold and fast'), false);
  const fire = stayGuideLookup('Can we have a fire?', 'river');
  assert.match(fire.text, /call 911 first/);
  assert.equal(fire.text.includes('fireplace'), false);
  assert.match(fire.text, /Nothing is sent/);
  const fireplace = stayGuideLookup('Is there a fireplace?', 'ranch');
  assert.equal(fireplace.hits.some((hit) => /fireplace/i.test(hit.text)), true);
  assert.equal(emergencyLine('Is there a fireplace?'), null);
  const riverTub = hotTubLine('Can kids use the hot tub?', 'river') ?? '';
  assert.match(riverTub, /does not list a hot tub/);
  assert.equal(riverTub.includes('Keep the hot tub cover'), false);
  const ranchTubLine = stayGuideLookup('Can kids use the hot tub?', 'ranch');
  assert.match(ranchTubLine.text, /Keep the hot tub cover on/);
  assert.match(ranchTubLine.text, /Nothing is sent/);
  assert.equal(ranchTubLine.text.includes('$'), false);

  const secret = stayGuideLookup('What is the door code?', 'ranch', { checkIn: '2026-12-01', checkOut: '2026-12-04' });
  assert.equal(secret.kind, 'secret');
  assert.match(secret.text, /stay off this phone/);
  assert.equal(secret.hits.length, 0);
  assert.equal(/\d{3,}|password\s*[:=]/i.test(secret.text), false);
  const when = stayGuideLookup('When does the door code open?', 'ranch', { checkIn: '2026-12-01', checkOut: '2026-12-04' });
  assert.equal(when.kind, 'gap');
  assert.match(when.text, /November 30, 2026/);
  assert.match(when.text, /day before check-in/);
  assert.match(when.text, /Nothing is sent/);
  assert.equal(/code\s*\d/i.test(when.text), false);
  assert.equal(when.text.includes('$'), false);

  const dog = stayGuideLookup('Can we bring a dog?', 'lindon');
  assert.equal(dog.kind, 'gap');
  assert.match(dog.text, /does not name a pet rule/);
  assert.equal(/allowed|no pets|\$/i.test(dog.text), false);

  const other = stayGuideLookup('Who is staying next week?', 'ranch');
  assert.equal(other.kind, 'empty');
  assert.match(other.text, /does not say that/);
  assert.equal(other.text.includes('$'), false);

  assert.equal(stayGuideLookup('   ', 'river').kind, 'blank');

  const checkIn = stayGuideLookup('When is check-in?', 'ranch');
  assert.equal(checkIn.kind, 'hits');
  assert.match(checkIn.hits.map((hit) => `${hit.title} ${hit.text}`).join(' '), /Check-in time is 4:00 PM/);
  assert.equal(checkIn.hits.map((hit) => hit.text).join(' ').includes('$'), false);
  assert.equal(/door\s*code|wi-?fi|password/i.test(checkIn.hits.map((hit) => hit.text).join(' ')), false);

  const checkOut = stayGuideLookup('What time is checkout?', 'river');
  assert.equal(checkOut.kind, 'hits');
  assert.match(checkOut.hits.map((hit) => hit.text).join(' '), /Checkout time is 11:00 AM/);
  assert.equal(checkOut.hits.some((hit) => hit.text.includes('10 PM')), false);
  assert.equal(checkIn.hits.some((hit) => hit.text.includes('This stay checks in')), false);

  const owned = stayGuideLookup('Can we book these dates?', 'ranch', { checkIn: '2026-12-01', checkOut: '2026-12-04' });
  assert.equal(owned.kind, 'gap');
  assert.match(owned.text, /This stay checks in on December 1, 2026/);
  assert.match(owned.text, /checks out on December 4, 2026/);
  assert.match(owned.text, /Nothing is sent/);
  assert.equal(owned.text.includes('quoted'), false);
  assert.equal(/\bis open\b/.test(owned.text), false);
  assert.equal(owned.text.includes('$'), false);
  const visitors = stayGuideLookup('Can we have visitors?', 'ranch', { checkIn: '2026-12-01', checkOut: '2026-12-04' });
  assert.equal(visitors.kind, 'gap');
  assert.match(visitors.text, /The stay is for the guests on the booking/);
  assert.match(visitors.text, /This phone does not change that count/);
  assert.match(visitors.text, /Nothing is sent/);
  assert.equal(/allowed|fee|charge|\$/i.test(visitors.text), false);
  const ownedPark = stayGuideLookup('Where should we park?', 'ranch', { checkIn: '2026-12-01', checkOut: '2026-12-04' });
  assert.match(`${ownedPark.text} ${ownedPark.hits.map((hit) => hit.text).join(' ')}`, /driveway/i);
  assert.equal(ownedPark.text.includes('checks in on'), false);

  const dated = stayGuideLookup('When is check-in?', 'ranch', { checkIn: '2026-12-01', checkOut: '2026-12-04' });
  const datedText = dated.hits.map((hit) => `${hit.title} ${hit.text}`).join(' ');
  assert.match(datedText, /This stay checks in on December 1, 2026/);
  assert.match(datedText, /Check-in time is 4:00 PM/);
  assert.match(datedText, /This stay checks out on December 4, 2026/);
  assert.equal(dated.hits.every((hit) => hit.title === 'Check-in' || hit.title === 'Checkout' || hit.title === 'Arrival'), true);
  assert.equal(datedText.includes('$'), false);
  assert.equal(/door\s*code|wi-?fi|password/i.test(datedText), false);

  const leave = stayGuideLookup('What time is checkout?', 'ranch', { checkIn: '2026-12-01', checkOut: '2026-12-04' });
  const leaveText = leave.hits.map((hit) => hit.text).join(' ');
  assert.match(leaveText, /This stay checks out on December 4, 2026/);
  assert.match(leaveText, /Checkout time is 11:00 AM/);
  assert.equal(leave.hits.some((hit) => hit.title === 'Check-in'), false);
  assert.equal(leaveText.includes('$'), false);

  const arrive = stayGuideLookup('When do we arrive?', 'ranch', { checkIn: '2026-12-01', checkOut: '2026-12-04' });
  const arriveText = arrive.hits.map((hit) => `${hit.title} ${hit.text}`).join(' ');
  assert.match(arriveText, /This stay checks in on December 1, 2026/);
  assert.match(arriveText, /Check-in time is 4:00 PM/);
  assert.match(arriveText, /Lindon/);
  assert.equal(arriveText.includes('$'), false);
  assert.equal(/door\s*code|wi-?fi|password/i.test(arriveText), false);

  const publicArrive = guideClockHits('When do we arrive?', 'ranch');
  const publicText = publicArrive.map((hit) => hit.text).join(' ');
  assert.match(publicText, /Check-in time is 4:00 PM/);
  assert.match(publicText, /Lindon/);
  assert.equal(publicText.includes('This stay'), false);
  assert.equal(publicText.includes('$'), false);

  const publicLeave = stayGuideLookup('When do we leave?', 'river');
  const publicLeaveText = publicLeave.hits.map((hit) => hit.text).join(' ');
  assert.match(publicLeaveText, /Checkout time is 11:00 AM/);
  assert.equal(publicLeaveText.includes('This stay'), false);
  assert.equal(publicLeaveText.includes('10 PM'), false);
  assert.equal(publicLeaveText.includes('$'), false);

  const night = stayGuideLookup('Are quiet hours in effect right now?', 'ranch', undefined, 23);
  const nightText = night.hits.map((hit) => hit.text).join(' ');
  assert.match(nightText, /in effect until 8:00 AM/);
  assert.equal(nightText.includes('$'), false);
  assert.equal(/door\s*code|wi-?fi|password/i.test(nightText), false);

  const day = stayGuideLookup('Are quiet hours in effect right now?', 'ranch', undefined, 15);
  assert.match(day.hits.map((hit) => hit.text).join(' '), /not in effect/);
  assert.match(day.hits.map((hit) => hit.text).join(' '), /10:00 PM to 8:00 AM/);

  const riverNow = stayGuideLookup('Are quiet hours in effect right now?', 'river', undefined, 23);
  const riverNowText = riverNow.hits.map((hit) => hit.text).join(' ');
  assert.match(riverNowText, /quiet hours apply/i);
  assert.equal(riverNowText.includes('10 PM'), false);
  assert.equal(riverNowText.includes('10:00 PM'), false);
  assert.equal(riverNowText.includes('$'), false);

  const listed = stayGuideLookup('What are the quiet hours?', 'ranch', undefined, 23);
  assert.equal(listed.hits.some((hit) => hit.text.includes('in effect until')), false);
});

test('a directions question names the published address and the arrival note', () => {
  const hits = guideDirectionHits('How do I get there?', 'ranch');
  const text = hits.map((hit) => `${hit.title} ${hit.text}`).join(' ');
  assert.match(text, /Address/);
  assert.match(text, /270 East Center Street, Lindon, Utah 84042/);
  assert.match(text, /45 minutes south of the Salt Lake airport/);
  assert.equal(text.includes('$'), false);
  assert.equal(/door\s*code|wi-?fi|password/i.test(text), false);
  const phone = stayGuideLookup('How do I get there?', 'river', { checkIn: '2026-12-01', checkOut: '2026-12-04' });
  assert.equal(phone.kind, 'hits');
  const phoneText = phone.hits.map((hit) => hit.text).join(' ');
  assert.match(phoneText, /Vivian Park, Provo Canyon/);
  assert.match(phoneText, /Drive up Provo Canyon/);
  assert.equal(phoneText.includes('$'), false);
  assert.equal(/This stay checks in/.test(phoneText), false);
  assert.equal(guideDirectionHits('Where do I park?', 'ranch').length, 0);
  const here = stayGuideLookup('Where is this house?', 'ranch', { checkIn: '2026-12-01', checkOut: '2026-12-04' });
  assert.equal(here.kind, 'hits');
  const hereText = here.hits.map((hit) => `${hit.title} ${hit.text}`).join(' ');
  assert.match(hereText, /270 East Center Street, Lindon, Utah 84042/);
  assert.match(hereText, /45 minutes south of the Salt Lake airport/);
  assert.equal(hereText.includes('Quiet hours'), false);
  assert.equal(hereText.includes('Provo Canyon'), false);
  assert.equal(hereText.includes('$'), false);
  const staying = stayGuideLookup('Where are we staying?', 'lindon');
  const stayingText = staying.hits.map((hit) => hit.text).join(' ');
  assert.match(stayingText, /143 Harcliff Circle, Lindon, Utah 84042/);
  assert.equal(stayingText.includes('Provo Canyon'), false);
});

test('an early arrival or a later checkout uses the dates on the page', () => {
  const calendar = { taken: { ranch: ['2026-11-28'], river: [] as string[] }, closed: { ranch: [] as string[], river: [] as string[] } };
  const free = flexStayLine('Can we arrive early?', 'ranch', { checkIn: '2026-11-16', checkOut: '2026-11-18' }, calendar, '2026-10-31');
  assert.match(free ?? '', /Arrive at 1:00 PM is a request/);
  assert.match(free ?? '', /Nothing is sent/);
  assert.equal((free ?? '').includes('$'), false);
  const held = flexStayLine('Can we arrive early?', 'ranch', { checkIn: '2026-11-29', checkOut: '2026-12-01' }, calendar, '2026-10-31');
  assert.match(held ?? '', /An early arrival is not open for this stay/);
  assert.equal((held ?? '').includes('1:00 PM is a request'), false);
  const unread = flexStayLine('Can we arrive early?', 'ranch', { checkIn: '2026-11-16', checkOut: '2026-11-18' }, null, '2026-10-31');
  assert.match(unread ?? '', /waits until the calendar can be read/);
  assert.equal((unread ?? '').includes('door code still opens'), false);
  const late = flexStayLine('Can we leave later?', 'ranch', { checkIn: '2026-11-16', checkOut: '2026-11-18' }, { taken: { ranch: ['2026-11-18'] }, closed: { ranch: [] } }, '2026-10-31');
  assert.match(late ?? '', /A 2:00 PM leave is not open for this checkout/);
  const river = flexStayLine('Can we arrive early?', 'river', { checkIn: '2026-11-01', checkOut: '2026-11-03' }, calendar, '2026-10-31');
  assert.match(river ?? '', /An early arrival is not open for this stay/);
  const arrive = stayGuideLookup('When do we arrive?', 'ranch', { checkIn: '2026-12-01', checkOut: '2026-12-04' });
  const arriveText = arrive.hits.map((hit) => hit.text).join(' ');
  assert.match(arriveText, /December 1/);
  assert.equal(arriveText.includes('1:00 PM'), false);
  const phone = stayGuideLookup('Can we arrive early?', 'ranch', { checkIn: '2026-11-16', checkOut: '2026-11-18' }, undefined, calendar);
  assert.equal(phone.kind, 'gap');
  assert.match(phone.text, /1:00 PM is a request/);
  assert.match(phone.text, /still opens the day before/);
  const shown = publicFlexLine(free);
  assert.match(shown ?? '', /1:00 PM is a request/);
  assert.equal(/door code/i.test(shown ?? ''), false);
  assert.equal(phone.hits.length, 0);
  const bookedStay = flexStayLine(
    'Can we arrive early and leave later?',
    'ranch',
    { checkIn: '2026-11-25', checkOut: '2026-11-27' },
    { taken: { ranch: ['2026-11-25', '2026-11-26'] }, closed: { ranch: [] } },
    '2026-10-31',
  );
  assert.match(bookedStay ?? '', /Those nights are already booked/);
  assert.equal((bookedStay ?? '').includes('1:00 PM is a request'), false);
  assert.equal((bookedStay ?? '').includes('2:00 PM is a request'), false);
  const atOne = stayGuideLookup('Can we arrive at 1?', 'ranch', { checkIn: '2026-11-16', checkOut: '2026-11-18' }, undefined, calendar);
  assert.match(atOne.text, /Arrive at 1:00 PM is a request/);
  assert.equal(atOne.text.includes('$'), false);
  const atTen = stayGuideLookup('Can we arrive at 10?', 'ranch', { checkIn: '2026-11-16', checkOut: '2026-11-18' }, undefined, calendar);
  const atTenText = `${atTen.text} ${atTen.hits.map((hit) => hit.text).join(' ')}`;
  assert.equal(atTenText.includes('1:00 PM is a request'), false);
  assert.match(atTenText, /4:00 PM/);
  const atTwo = stayGuideLookup('Can we leave at 2?', 'ranch', { checkIn: '2026-11-16', checkOut: '2026-11-18' }, undefined, calendar);
  assert.match(atTwo.text, /Leave at 2:00 PM is a request/);
  const atEleven = stayGuideLookup('Can we leave at 11?', 'ranch', { checkIn: '2026-11-16', checkOut: '2026-11-18' }, undefined, calendar);
  const atElevenText = `${atEleven.text} ${atEleven.hits.map((hit) => hit.text).join(' ')}`;
  assert.equal(atElevenText.includes('2:00 PM is a request'), false);
  assert.match(atElevenText, /11:00 AM/);
  const heldOne = stayGuideLookup('Can we arrive at 1?', 'ranch', { checkIn: '2026-11-29', checkOut: '2026-12-01' }, undefined, calendar);
  assert.match(heldOne.text, /An early arrival is not open for this stay/);
  const shownOne = publicFlexLine(atOne.text);
  assert.match(shownOne ?? '', /1:00 PM is a request/);
  assert.equal(/door code/i.test(shownOne ?? ''), false);
});

test('a winter driving question uses the River lines and does not invent one', () => {
  const river = winterDriveLine('Do we need 4WD in the snow?', 'river') ?? '';
  assert.match(river, /AWD or 4WD in winter/);
  assert.match(river, /plows/);
  assert.match(river, /Nothing is sent/);
  assert.equal(river.includes('$'), false);
  assert.equal(/\bis open\b/i.test(river), false);
  const ranch = winterDriveLine('Do we need 4WD?', 'ranch') ?? '';
  assert.match(ranch, /does not name a winter driving rule/);
  assert.equal(ranch.includes('Provo Canyon'), false);
  const ski = winterDriveLine('Where should we ski?', 'river');
  assert.equal(ski, null);
  const phone = stayGuideLookup('Do we need 4WD in the snow?', 'river');
  assert.equal(phone.kind, 'gap');
  assert.match(phone.text, /Vivian Park/);
});

test('a meal question stays on the published food list', () => {
  const hits = guideNearbyHits('Where should we eat?', 'ranch');
  assert.equal(hits.some((hit) => hit.title === 'Oteo'), true);
  assert.equal(hits.some((hit) => hit.text.includes('$')), false);
  const skiHits = guideNearbyHits('Where should we ski?', 'ranch');
  assert.equal(skiHits.some((hit) => /Sundance/.test(hit.title)), true);
  assert.equal(skiHits.some((hit) => hit.title === 'Oteo'), false);
  const phone = stayGuideLookup('Where should we eat?', 'ranch');
  assert.equal(phone.kind, 'hits');
  assert.equal(phone.hits.some((hit) => hit.title === 'Oteo'), true);
  assert.equal(phone.hits.some((hit) => hit.text.includes('$')), false);
  const hike = guideNearbyHits('Where can we hike?', 'ranch');
  assert.equal(hike.some((hit) => hit.title === 'Bridal Veil Falls'), true);
  assert.equal(hike.some((hit) => hit.title === 'Oteo'), false);
  const kids = guideNearbyHits('Where can the kids go?', 'ranch');
  assert.equal(kids.some((hit) => hit.title === 'Thanksgiving Point'), true);
  assert.equal(guideNearbyHits('Can 4 kids stay?', 'ranch').length, 0);
  assert.equal(guideNearbyHits('Plan an outdoors day', 'river').length, 0);
  const hikePhone = stayGuideLookup('Where can we hike?', 'ranch');
  assert.equal(hikePhone.kind, 'hits');
  assert.equal(hikePhone.hits.some((hit) => hit.title === 'Bridal Veil Falls'), true);
  const riverStore = guideNearbyHits('Where can we get groceries?', 'river');
  assert.equal(riverStore.some((hit) => hit.title === 'Groceries'), true);
  assert.match(riverStore.map((hit) => hit.text).join(' '), /Vivian Park/);
  assert.equal(riverStore.some((hit) => hit.text.includes('$')), false);
  const ranchStore = guideNearbyHits('Where can we get groceries?', 'ranch');
  assert.equal(ranchStore.length, 1);
  assert.match(ranchStore[0]?.text ?? '', /does not name a grocery store/);
  const groceryPhone = stayGuideLookup('Where can we get groceries?', 'river');
  assert.equal(groceryPhone.kind, 'hits');
  assert.equal(groceryPhone.hits.filter((hit) => hit.title === 'Groceries').length, 1);
});

test('the quote guide names this stay’s check-in and checkout', () => {
  const stay = { checkIn: '2026-11-06', checkOut: '2026-11-08' };
  const arrive = dateThisStay(guideClockHits('When is check-in?', 'river'), stay);
  const arriveText = arrive.map((hit) => hit.text).join(' ');
  assert.match(arriveText, /This stay checks in on November 6, 2026/);
  assert.match(arriveText, /Check-in time is 4:00 PM/);
  assert.equal(arriveText.includes('This stay checks out'), false);
  assert.equal(arriveText.includes('$'), false);
  assert.equal(/door\s*code|wi-?fi|password/i.test(arriveText), false);

  const leave = dateThisStay(guideClockHits('When is checkout?', 'river'), stay);
  const leaveText = leave.map((hit) => hit.text).join(' ');
  assert.match(leaveText, /This stay checks out on November 8, 2026/);
  assert.match(leaveText, /Checkout time is 11:00 AM/);
  assert.equal(leaveText.includes('This stay checks in'), false);
  assert.equal(leaveText.includes('$'), false);

  const house = dateThisStay(guideClockHits('When is check-in?', 'river'));
  assert.equal(house.map((hit) => hit.text).join(' ').includes('This stay'), false);

  const lines = keepClockLines('When is check-in?', searchHouseManual('When is check-in?', ['river']));
  assert.equal(lines.more, 0);
  assert.equal(lines.hits.every((hit) => hit.title === 'Check-in' || hit.title === 'Checkout' || hit.title === 'Arrival'), true);
  assert.equal(lines.hits.some((hit) => /tubing|railroad/i.test(`${hit.title} ${hit.text}`)), false);
  const trash = keepClockLines('What should we do with the trash?', searchHouseManual('What should we do with the trash?', ['ranch']));
  assert.equal(trash.hits.some((hit) => /trash/i.test(hit.text)), true);
});

test('a bedroom count, the airport, and the quiet-hours schedule stay on the published line', () => {
  const riverBeds = stayGuideLookup('How many bedrooms?', 'river', { checkIn: '2026-12-01', checkOut: '2026-12-04' });
  assert.equal(riverBeds.kind, 'hits');
  assert.match(riverBeds.hits.map((hit) => hit.text).join(' '), /Seven king suites/);
  const ranchBeds = stayGuideLookup('How many bedrooms?', 'ranch');
  assert.match(ranchBeds.hits.map((hit) => hit.text).join(' '), /does not list a bedroom count for The Ranch House/);
  assert.equal(ranchBeds.hits.map((hit) => hit.text).join(' ').includes('$'), false);
  const king = stayGuideLookup('Is there a king bed?', 'river');
  assert.equal(king.kind, 'hits');
  assert.match(king.hits.map((hit) => hit.text).join(' '), /expandable king/);

  const ranchAir = stayGuideLookup('How far is the airport?', 'ranch');
  assert.match(ranchAir.hits.map((hit) => hit.text).join(' '), /45 minutes south of the Salt Lake airport/);
  const riverAir = stayGuideLookup('How far is the airport?', 'river');
  assert.match(riverAir.hits.map((hit) => hit.text).join(' '), /does not name the airport/);
  assert.equal(riverAir.hits.map((hit) => hit.text).join(' ').includes('45 minutes'), false);

  const schedule = stayGuideLookup('What time are quiet hours?', 'ranch', undefined, 23);
  const scheduleText = schedule.hits.map((hit) => hit.text).join(' ');
  assert.match(scheduleText, /Quiet hours 10 PM to 8 AM/);
  assert.equal(scheduleText.includes('in effect until'), false);
  const riverSchedule = stayGuideLookup('What time are quiet hours?', 'river', undefined, 23);
  const riverScheduleText = riverSchedule.hits.map((hit) => hit.text).join(' ');
  assert.match(riverScheduleText, /mountain neighborhood/);
  assert.equal(riverScheduleText.includes('10 PM'), false);
  assert.equal(riverScheduleText.includes('10:00 PM'), false);

  const sunday = stayGuideLookup('Are restaurants open on Sunday?', 'ranch');
  assert.equal(sunday.hits[0]?.title, 'Sunday');
  assert.match(sunday.hits[0]?.text ?? '', /close on Sundays/);
  assert.equal(sunday.hits.some((hit) => hit.title === 'Oteo'), true);
  const plain = stayGuideLookup('Where should we eat?', 'ranch');
  assert.equal(plain.hits.some((hit) => hit.title === 'Sunday'), false);
  const joined = [riverBeds, ranchBeds, ranchAir, riverAir, schedule, riverSchedule, sunday]
    .flatMap((row) => row.hits.map((hit) => hit.text))
    .join('\n');
  assert.equal(joined.includes('$'), false);
  assert.equal(/door\s*code|wi-?fi|password/i.test(joined), false);
  assert.equal(/\bis open\b/i.test(joined), false);
});

test('a party, a sleep count, septic, and a first stay stay on the published line', () => {
  const ranchParty = stayGuideLookup('Can we have a party?', 'ranch', { checkIn: '2026-12-01', checkOut: '2026-12-04' });
  assert.match(ranchParty.hits.map((hit) => hit.text).join(' '), /The Ranch House does not take a party/);
  const riverParty = stayGuideLookup('Can we throw a party?', 'river');
  assert.match(riverParty.hits.map((hit) => hit.text).join(' '), /without written approval/);
  const sized = stayGuideLookup('Can 30 guests stay at the Ranch House?', 'ranch');
  assert.match(sized.text, /sleeps 20/);
  assert.equal(sized.hits.some((hit) => hit.title === 'Sleeps'), false);

  const ranchSleep = stayGuideLookup('How many people can sleep here?', 'ranch');
  assert.match(ranchSleep.hits.map((hit) => hit.text).join(' '), /The Ranch House sleeps 20/);
  const riverSleep = stayGuideLookup('How many people can sleep here?', 'river');
  assert.match(riverSleep.hits.map((hit) => hit.text).join(' '), /The River House sleeps 24/);
  const park = stayGuideLookup('Where should we park?', 'ranch');
  assert.equal(park.hits.length > 0 && park.hits.every((hit) => hit.title === 'Parking'), true);
  const theseNights = stayGuideLookup('Where should we park these nights?', 'ranch', { checkIn: '2026-12-01', checkOut: '2026-12-04' });
  const theseText = theseNights.hits.map((hit) => hit.text).join(' ');
  assert.match(theseText, /Park in the driveway/);
  assert.equal(theseText.includes('checks in on'), false);
  assert.equal(theseText.includes('$'), false);
  const riverPark = stayGuideLookup('Where should we park these nights?', 'river');
  assert.match(riverPark.hits.map((hit) => hit.text).join(' '), /driveway and garage/);
  const trash = stayGuideLookup('Where do we put the trash?', 'ranch', { checkIn: '2026-12-01', checkOut: '2026-12-04' });
  const trashText = trash.hits.map((hit) => hit.text).join(' ');
  assert.match(trashText, /Take kitchen trash to the outside bins/);
  assert.equal(trashText.includes('checks in on'), false);
  assert.equal(trashText.includes('$'), false);
  const towels = stayGuideLookup('Where should we put the towels tonight?', 'river');
  assert.match(towels.hits.map((hit) => hit.text).join(' '), /used towels in the laundry room/);
  assert.equal(towels.hits.some((hit) => /trash|fireplace|dishwasher/i.test(hit.text)), false);
  const parkCity = stayGuideLookup('Where should we eat in Park City?', 'ranch');
  assert.equal(parkCity.hits.some((hit) => hit.title === 'Parking'), false);

  const riverSeptic = stayGuideLookup('Is there a septic system?', 'river');
  assert.match(riverSeptic.hits.map((hit) => hit.text).join(' '), /Only toilet paper goes in the toilets/);
  const ranchSeptic = stayGuideLookup('Is there a septic system?', 'ranch');
  assert.match(ranchSeptic.hits.map((hit) => hit.text).join(' '), /does not list a septic note/);

  const riverFirst = stayGuideLookup('When does the River House take its first stay?', 'ranch');
  assert.equal(riverFirst.hits[0]?.house, 'river');
  assert.match(riverFirst.hits.map((hit) => hit.text).join(' '), /November 1, 2026/);
  const ranchFirst = stayGuideLookup('When does this house take its first stay?', 'ranch');
  assert.match(ranchFirst.hits.map((hit) => hit.text).join(' '), /does not name a first-stay date for The Ranch House/);

  const joined = [ranchParty, riverParty, sized, ranchSleep, riverSleep, riverSeptic, ranchSeptic, riverFirst, ranchFirst]
    .flatMap((row) => [row.text, ...row.hits.map((hit) => hit.text)])
    .join('\n');
  assert.equal(joined.includes('$'), false);
  assert.equal(/door\s*code|wi-?fi|password/i.test(joined), false);
  assert.equal(/\bis open\b/i.test(joined), false);
});
