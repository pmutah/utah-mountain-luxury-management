import assert from 'node:assert/strict';
import test from 'node:test';
import { agentBrief } from './agent-brief.ts';

test('the night brief names the work and leaves the guest off it', () => {
  const lines = agentBrief({
    asOf: '2026-11-01',
    stays: [
      { id: 'same', propertyId: 'ranch', checkIn: '2026-10-28', checkOut: '2026-11-04', status: 'confirmed', source: 'Airbnb' },
      {
        id: 'next',
        propertyId: 'ranch',
        checkIn: '2026-11-04',
        checkOut: '2026-11-08',
        source: 'VRBO',
        note: 'Ada Lovelace · 9 guests · 801-555-0100',
      },
      { id: 'later', propertyId: 'lindon', checkIn: '2026-11-01', checkOut: '2026-11-07' },
      { id: 'gone', propertyId: 'river', checkIn: '2026-11-01', checkOut: '2026-11-03', status: 'cancelled' },
    ],
    shadowDays: 1,
    openJobs: 2,
    calendarReady: true,
  });
  const text = lines.map((line) => line.text).join('\n');
  assert.equal(text.includes('Guest'), false);
  assert.match(text, /Shadow day 1 of 7/);
  assert.match(text, /Hospitable write closed/);
  assert.match(text, /Where they booked: 1 Airbnb, 1 VRBO/);
  assert.match(text, /Open stretch on the calendar: Ranch Nov 8 for \d+ nights\. River Nov 1 for 120 nights/);
  assert.match(text, /Next open arrival from these bookings: River Nov 1 for 2 nights\. Ranch Nov 8 for 1 night\. Lindon Nov 7 for 1 night\./);
  assert.match(text, /Length choices from these bookings: River Nov 1 can quote 2, 3, 4, 7, 14, 28 nights\. Ranch Nov 8 can quote 1, 2, 3, 4, 7, 14, 28 nights\. Lindon Nov 7 can quote /);
  assert.match(text, /Add-ons from these bookings: River Nov 1 can request a later checkout\. Ranch Nov 8 can request a later checkout and the hot tub\. Lindon Nov 7 can request a later checkout\./);
  assert.match(text, /Booking calendar from these bookings:.*Nov 23 starts at 4 nights/);
  assert.match(text, /weekend nights show 2 nights/);
  assert.match(text, /Other houses from these bookings:/);
  assert.equal(text.split('\n').find((line) => line.includes('Other houses from these bookings:'))?.includes('$') ?? false, false);
  assert.match(text, /Same-day clean at Ranch on Nov 4\. Checkout at 11:00 AM\. The next guest arrives at 4:00 PM\./);
  assert.match(text, /A 2:00 PM leave is not open for this checkout/);
  assert.match(text, /An early arrival is not open for this stay/);
  assert.match(text, /The next stay can request the hot tub/);
  assert.equal(text.includes('$'), false);
  assert.match(text, /The next stay starts November 4, 2026\. The door code opens November 3, 2026/);
  assert.match(text, /The next stay is for 9 guests\. Names stay off this list\./);
  assert.match(text, /This checkout does not say how many guests\. Names stay off this list\./);
  assert.match(text, /1 stay names a party size\. 1 does not: Lindon Nov 1\. Names stay off this line\./);
  assert.match(text, /No stay beginning in the next 90 days names children/);
  assert.equal(text.includes('arrival time'), false);
  const withArrival = agentBrief({
    asOf: '2026-11-01',
    stays: [
      {
        id: 'next',
        propertyId: 'ranch',
        checkIn: '2026-11-04',
        checkOut: '2026-11-08',
        note: 'Ada Lovelace · 9 guests · 801-555-0100',
      },
      { id: 'later', propertyId: 'lindon', checkIn: '2026-11-01', checkOut: '2026-11-07' },
    ],
    shadowDays: 1,
    openJobs: 0,
    calendarReady: true,
    arrivalWindows: { next: '6:00 PM', later: '801-555-0100' },
  });
  const arrivalText = withArrival.map((line) => line.text).join('\n');
  assert.match(arrivalText, /1 stay names an arrival time: Ranch Nov 4, Arrival around 6:00 PM\. 1 does not: Lindon Nov 1\./);
  assert.equal(arrivalText.includes('801'), false);
  assert.equal(arrivalText.includes('Ada'), false);
  const turnArrival = agentBrief({
    asOf: '2026-11-01',
    stays: [
      { id: 'out', propertyId: 'ranch', checkIn: '2026-11-01', checkOut: '2026-11-04', status: 'confirmed' },
      { id: 'in', propertyId: 'ranch', checkIn: '2026-11-04', checkOut: '2026-11-07', note: 'Ada Lovelace · 801-555-0100' },
    ],
    shadowDays: 1,
    openJobs: 0,
    calendarReady: true,
    arrivalWindows: { in: '6:00 PM' },
    departureWindows: { out: '2:00 PM' },
  });
  const turnText = turnArrival.map((line) => line.text).join('\n');
  assert.match(turnText, /The next stay names an arrival\. Arrival around 6:00 PM\./);
  assert.match(turnText, /This checkout names a departure\. Leave at 2:00 PM\. Nothing is charged yet\./);
  assert.equal(turnText.includes('801'), false);
  assert.equal(turnText.includes('Ada'), false);
  assert.equal(text.includes('Ada'), false);
  assert.equal(text.includes('801'), false);
  assert.match(text, /No next stay is on the calendar/);
  assert.match(text, /Ranch: \d+ raises, \d+ promotions, [1-9]\d* booked left alone/);
  assert.match(text, /Nothing sent/);
  assert.equal(text.includes('$'), false);
  assert.match(text, /Lindon checkout Nov 7\..*Checkout at 11:00 AM\./);
  assert.match(text, /Before checkout the guest was asked to start the dishwasher/);
  assert.match(text, /The River House: Only toilet paper/);
  assert.match(text, /The Ranch House: Put the hot tub cover back on/);
  assert.equal(text.includes('River checkout'), false);
  assert.match(text, /River still uses a rendering/);
  assert.equal(text.includes('Ranch has one photo'), false);
  assert.equal(text.includes('Lindon has one photo'), false);
  assert.match(text, /Direct booking still emails a request/);
  assert.match(text, /Nothing is posted to Airbnb or VRBO/);
  assert.match(text, /No door code opens on the guest phone tomorrow/);
  assert.match(text, /Door codes stay hidden/);
  assert.match(text, /Nothing here signs it/);
  assert.match(text, /printed trip sheet leaves the code/);
  assert.match(text, /keeps the house notes and the house rules/);
  assert.match(text, /2 shared jobs are open/);
  assert.match(text, /does not claim one/);
  assert.match(text, /does not change partner spend/);
  const withFix = agentBrief({
    asOf: '2026-11-01',
    stays: [],
    shadowDays: 1,
    openJobs: 0,
    calendarReady: true,
    fixes: [{ id: 'job', house: 'Lindon', checkout: '2026-11-07', note: 'Hot tub cover is loose.' }],
  });
  assert.match(withFix.map((line) => line.text).join('\n'), /Lindon checkout Nov 7: Hot tub cover is loose/);
  const withHouse = agentBrief({
    asOf: '2026-11-01',
    stays: [],
    shadowDays: 1,
    openJobs: 0,
    calendarReady: false,
    booksPaused: true,
    houseFixes: [{ house: 'river', note: 'Septic smell in the hall.' }],
  });
  const houseText = withHouse.map((line) => line.text).join('\n');
  assert.match(houseText, /The River House has a note and no stay is attached: Septic smell in the hall/);
  assert.match(houseText, /Nothing was sent/);
  assert.equal(houseText.includes('$'), false);
  const unreadBlocks = agentBrief({
    asOf: '2026-11-01',
    stays: [],
    shadowDays: 1,
    openJobs: 0,
    calendarReady: true,
    blocksReady: false,
  });
  const unreadText = unreadBlocks.map((line) => line.text).join('\n');
  assert.match(unreadText, /Calendar blocks could not be read/);
  assert.match(unreadText, /No night is called open/);
  assert.equal(unreadText.includes('Next open arrival'), false);
  const unreadLeave = agentBrief({
    asOf: '2026-11-01',
    stays: [{ id: 'out', propertyId: 'ranch', checkIn: '2026-10-30', checkOut: '2026-11-02', status: 'confirmed' }],
    shadowDays: 1,
    openJobs: 0,
    calendarReady: true,
    blocksReady: false,
  });
  const leaveText = unreadLeave.map((line) => line.text).join('\n');
  assert.match(leaveText, /Calendar blocks could not be read/);
  assert.equal(leaveText.includes('Leave at 2:00 PM is a request'), false);
  assert.equal(leaveText.includes('An early arrival is'), false);
  assert.equal(leaveText.includes('$'), false);
  assert.equal(unreadText.includes('$'), false);
  const held = agentBrief({
    asOf: '2026-11-01',
    stays: [],
    shadowDays: 1,
    openJobs: 0,
    calendarReady: true,
    closed: [{ propertyId: 'river', start: '2026-11-01', end: '2026-11-03' }],
  });
  const heldText = held.map((line) => line.text).join('\n');
  assert.match(heldText, /Open stretch on the calendar: Ranch Nov 1 for 120 nights\. River Nov 3 for 118 nights/);
  assert.match(heldText, /Next open arrival from these bookings: River Nov 3 for 2 nights\. Ranch Nov 1 for 1 night\. Lindon Nov 1 for 1 night/);
  assert.match(heldText, /River Nov 3 can quote 2, 3, 4, 7, 14, 28 nights/);
  assert.match(heldText, /River Nov 3 can request a later checkout and a grocery drop/);
  assert.match(heldText, /Nothing still on the books/);
  assert.equal(heldText.includes('$'), false);
});

test('seven shadow days still leave the write closed', () => {
  const lines = agentBrief({ asOf: '2026-11-01', stays: [], shadowDays: 9, openJobs: 0, calendarReady: true });
  const text = lines.map((line) => line.text).join('\n');
  assert.match(text, /Shadow days 7 of 7/);
  assert.match(text, /Hospitable write closed/);
  assert.match(text, /No checkouts in the next two weeks/);
  assert.match(text, /Nothing still on the books/);
  assert.match(text, /Open stretch on the calendar: Ranch Nov 1 for 120 nights\. River Nov 1 for 120 nights/);
  assert.match(text, /Next open arrival from these bookings: River Nov 1 for 2 nights\. Ranch Nov 1 for 1 night\. Lindon Nov 1 for 1 night\./);
  assert.match(
    text,
    /Length choices from these bookings: River Nov 1 can quote 2, 3, 4, 7, 14, 28 nights\. Ranch Nov 1 can quote 1, 2, 3, 4, 7, 14, 28 nights\. Lindon Nov 1 can quote 1, 2, 3, 4, 7, 14, 28 nights/,
  );
  assert.match(
    text,
    /Add-ons from these bookings: River Nov 1 can request a later checkout\. Ranch Nov 1 can request a later checkout\. Lindon Nov 1 can request a later checkout\./,
  );
  assert.match(text, /No shared jobs are open/);
  assert.match(text, /River: 9 of 10 sample comps list an EV charger\. Our guide does not\./);
  assert.match(text, /These are sample comps, not live listings/);
  assert.equal(text.includes('$'), false);
});

test('a paused book does not raise nights from a stand-in list', () => {
  const lines = agentBrief({
    asOf: '2026-11-01',
    stays: [
      {
        id: 'stand-in',
        propertyId: 'ranch',
        checkIn: '2026-11-01',
        checkOut: '2026-11-04',
        status: 'confirmed',
        note: 'NameLeak · 8 guests',
      },
    ],
    shadowDays: 3,
    openJobs: 0,
    calendarReady: true,
    booksPaused: true,
  });
  const text = lines.map((line) => line.text).join('\n');
  assert.match(text, /Saved bookings could not be read/);
  assert.match(text, /No night is raised or promoted/);
  assert.match(text, /Nothing was written over them/);
  assert.match(text, /direct request stays off/);
  assert.match(text, /does not ask for a name/);
  assert.match(text, /Next named event: BYU at Utah, Nov 6–7/);
  assert.match(text, /Nothing extra is added for it/);
  assert.match(text, /River: \d+ of \d+ sample comps sleep close to this house and sit within 10 miles/);
  assert.match(text, /Ranch: \d+ of \d+ sample comps sleep close/);
  assert.match(text, /Lindon: \d+ of \d+ sample comps sleep close/);
  assert.match(text, /The published ask stays/);
  assert.match(text, /River: 9 of 10 sample comps list an EV charger\. Our guide does not\./);
  assert.match(text, /These are sample comps, not live listings/);
  assert.match(text, /This does not change the rate band/);
  assert.equal(text.includes('$'), false);
  assert.match(text, /River, Ranch, and Lindon/);
  assert.match(text, /Nothing is raised/);
  assert.match(text, /Nothing is posted/);
  assert.match(text, /20% management fee to Brandon first/);
  assert.match(text, /hot tub request at the Ranch House/);
  assert.match(text, /grocery drop at the River House follow that same split/);
  assert.match(text, /does not change a booking or a saved expense/);
  assert.equal(text.includes('raises'), false);
  assert.equal(text.includes('NameLeak'), false);
  assert.equal(text.includes('$'), false);
});

test('a hidden sample comp changes the brief gap and does not post it', () => {
  const lines = agentBrief({
    asOf: '2026-11-01',
    stays: [],
    shadowDays: 1,
    openJobs: 0,
    calendarReady: false,
    hiddenComps: { river: ['river-1'] },
  });
  const text = lines.map((line) => line.text).join('\n');
  assert.match(text, /River: 8 of 10 sample comps list an EV charger\. Our guide does not\./);
  assert.match(text, /Nothing is posted/);
  assert.equal(text.includes('$'), false);
  assert.equal(/9 of 10 sample comps list an EV charger/.test(text), false);
});

test('a hidden far sample changes how many comps set the band', () => {
  const lines = agentBrief({
    asOf: '2026-11-01',
    stays: [],
    shadowDays: 1,
    openJobs: 0,
    calendarReady: false,
    hiddenComps: { river: ['river-8'] },
  });
  const text = lines.map((line) => line.text).join('\n');
  assert.match(text, /River: 8 of 10 sample comps sleep close to this house and sit within 10 miles/);
  assert.match(text, /The published ask stays/);
  assert.match(text, /Nothing is posted/);
  assert.equal(text.includes('$'), false);
});

test('the brief uses the same-day clock for two houses', () => {
  const canyon = agentBrief({
    asOf: '2026-11-04',
    stays: [
      { id: 'river-out', propertyId: 'river', checkIn: '2026-11-01', checkOut: '2026-11-04' },
      { id: 'river-in', propertyId: 'river', checkIn: '2026-11-04', checkOut: '2026-11-06', note: 'Arrive at 1:00 PM' },
      { id: 'ranch-out', propertyId: 'ranch', checkIn: '2026-11-01', checkOut: '2026-11-04', note: 'Leave at 2:00 PM' },
      { id: 'ranch-in', propertyId: 'ranch', checkIn: '2026-11-04', checkOut: '2026-11-06' },
    ],
    shadowDays: 1,
    openJobs: 0,
    calendarReady: true,
  })
    .map((line) => line.text)
    .join('\n');
  assert.match(canyon, /River and Ranch check out the same day/);
  assert.match(canyon, /not one route/);
  assert.match(canyon, /drive up Provo Canyon is not in the clock/);
  assert.equal(/fit one after the other/.test(canyon), false);
  assert.equal(canyon.includes('$'), false);
  const valley = agentBrief({
    asOf: '2026-11-04',
    stays: [
      { id: 'ranch-out', propertyId: 'ranch', checkIn: '2026-11-01', checkOut: '2026-11-04' },
      { id: 'ranch-in', propertyId: 'ranch', checkIn: '2026-11-04', checkOut: '2026-11-06', note: 'Arrive at 1:00 PM' },
      { id: 'lindon-out', propertyId: 'lindon', checkIn: '2026-11-01', checkOut: '2026-11-04', note: 'Leave at 2:00 PM' },
      { id: 'lindon-in', propertyId: 'lindon', checkIn: '2026-11-04', checkOut: '2026-11-06' },
    ],
    shadowDays: 1,
    openJobs: 0,
    calendarReady: true,
  })
    .map((line) => line.text)
    .join('\n');
  assert.match(valley, /Ranch and Lindon check out the same day/);
  assert.match(valley, /fit one after the other/);
  assert.equal(/not one route/.test(valley), false);
  assert.equal(valley.includes('$'), false);
});

test('a pinned sample comp changes the brief gap and does not post it', () => {
  const lines = agentBrief({
    asOf: '2026-11-01',
    stays: [],
    shadowDays: 1,
    openJobs: 0,
    calendarReady: false,
    pinnedComps: { river: ['river-b1'] },
  });
  const text = lines.map((line) => line.text).join('\n');
  assert.match(text, /River: 8 of 10 sample comps list an EV charger\. Our guide does not\./);
  assert.match(text, /These are sample comps, not live listings/);
  assert.match(text, /Nothing is posted/);
  assert.equal(/9 of 10 sample comps list an EV charger/.test(text), false);
  assert.equal(text.includes('$'), false);
});
