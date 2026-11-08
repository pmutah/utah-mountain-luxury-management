import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMarketBoard } from './board.ts';
import { houseShadowText, paceUnreadLine, portfolioDigest, raiseHint, runShadow, unreadMoneyNote } from './shadow.ts';

test('a booked night keeps the published rate even when comps are higher', () => {
  const board = buildMarketBoard('ranch', '2026-11-06', 3);
  const friday = board.nights[0]!;
  friday.action = 'raise';
  friday.proposedGuest = friday.ourGuest + 50;
  const run = runShadow(board, ['2026-11-06'], false, '2026-11-06');
  const guarded = run.nights[0]!;
  assert.equal(guarded.action, 'booked');
  assert.equal(guarded.proposedGuest, friday.ourGuest);
  assert.equal(run.counts.booked, 1);
  assert.match(run.digest, /Nothing sent to Hospitable/);
  assert.equal(run.digest.includes('guest'), false);
  const blocked = runShadow(board, ['2026-11-06'], false, '2026-11-06', 'short', ['2026-11-06']);
  assert.equal(blocked.nights[0]?.action, 'closed');
  assert.match(blocked.nights[0]?.reason ?? '', /Closed on the calendar/);
  assert.equal(blocked.counts.booked, 0);
  assert.equal(blocked.nights[0]?.promotionPercent, 0);
});

test('River nights before the first stay stay closed', () => {
  const board = buildMarketBoard('river', '2026-10-29', 3);
  const run = runShadow(board, [], false, '2026-10-29');
  assert.equal(run.nights.every((night) => night.action === 'closed'), true);
  assert.equal(run.counts.raise, 0);
});

test('pausing a house freezes every night', () => {
  const board = buildMarketBoard('lindon', '2026-11-06', 4);
  const run = runShadow(board, ['2026-11-06'], true, '2026-11-06');
  assert.equal(run.paused, true);
  assert.equal(run.nights.every((night) => night.action === 'paused' && night.proposedGuest === night.ourGuest), true);
  assert.match(run.digest, /Paused/);
});

test('an open night can still raise inside the cap', () => {
  /*
   * This ran on the sample band, which no longer moves a rate: a night whose only comps are invented is held
   * because the recommendation would rest on nothing. The behaviour under test — a real raise survives the
   * shadow run and stays inside the 8% cap — needs a band built from saved asks.
   */
  const comp = (id: string) => ({
    id,
    name: id,
    area: 'Orem',
    beds: 6,
    sleeps: 20,
    rating: 4.8,
    reviews: 10,
    guestFavorite: false,
    distanceMi: 4,
    isOwn: false,
    minNights: 1,
  });
  const board = buildMarketBoard('ranch', '2026-11-06', 2, undefined, {
    comps: [comp('k1'), comp('k2'), comp('k3')],
    index: new Map([
      ['k1', new Map([['2026-11-06', 1400]])],
      ['k2', new Map([['2026-11-06', 1450]])],
      ['k3', new Map([['2026-11-06', 1500]])],
    ]),
  });
  const open = board.nights[0]!;
  assert.equal(open.source, 'live', 'this fixture must carry a measured band');
  const run = runShadow(board, [], false, '2026-11-06');
  assert.equal(run.nights[0]?.action, 'raise');
  assert.ok(run.nights[0]!.proposedGuest <= Math.round(open.ourGuest * 1.08));
  assert.match(run.digest, /Largest raise/);
});

test('a short year can promote an open weekend without cutting the base', () => {
  /*
   * This used to run on the **sample** band, whose p75 for that night was $640 against an $890 base — so the
   * 20% promotion landed at $712 and stayed above the market. `promotionForNight` applied it anyway because it
   * never saw the band, which is why the River House was offered discounts that could not fill a night.
   *
   * The promotion still has to be possible, so this fixture gives real comps high enough that a 20% cut
   * actually reaches them. That is the case the rule is meant to allow.
   */
  const board = buildMarketBoard('ranch', '2026-11-06', 1, undefined, {
    comps: [
      { id: 'p1', name: 'Comp', area: 'Orem', beds: 6, sleeps: 20, rating: 4.8, reviews: 10, guestFavorite: false, distanceMi: 4, isOwn: false, minNights: 1 },
      { id: 'p2', name: 'Comp 2', area: 'Orem', beds: 6, sleeps: 20, rating: 4.8, reviews: 10, guestFavorite: false, distanceMi: 4, isOwn: false, minNights: 1 },
      { id: 'p3', name: 'Comp 3', area: 'Orem', beds: 6, sleeps: 20, rating: 4.8, reviews: 10, guestFavorite: false, distanceMi: 4, isOwn: false, minNights: 1 },
    ],
    index: new Map([
      ['p1', new Map([['2026-11-06', 950]])],
      ['p2', new Map([['2026-11-06', 980]])],
      ['p3', new Map([['2026-11-06', 1000]])],
    ]),
  });
  const night0 = board.nights[0]!;
  const before = night0.proposedGuest;
  assert.equal(night0.source, 'live', 'this fixture must carry a real band');
  assert.ok(night0.p75 >= 900, `p75 should be near the comps, got ${night0.p75}`);

  const run = runShadow(board, [], false, '2026-11-06', 'short');
  const night = run.nights[0]!;
  assert.equal(night.action, 'promote');
  assert.equal(night.promotionPercent, 20);
  assert.equal(night.proposedGuest, before, 'the base itself must not be cut');
  assert.ok(night.offerGuest < night.proposedGuest, 'the offer should be below the base');
  assert.ok(night.offerGuest >= night.floorGuest, 'the offer must respect the floor');
});

test('a promotion that cannot reach the market is not applied', () => {
  /*
   * The River case, reduced: a base far above a compact band. A 20% cut lands above p75, so it cannot fill
   * the night and must not be presented as a promotion. The night holds and the reason names both numbers.
   */
  const board = buildMarketBoard('ranch', '2026-11-06', 1, undefined, {
    comps: [
      { id: 'q1', name: 'Comp', area: 'Orem', beds: 6, sleeps: 20, rating: 4.8, reviews: 10, guestFavorite: false, distanceMi: 4, isOwn: false, minNights: 1 },
      { id: 'q2', name: 'Comp 2', area: 'Orem', beds: 6, sleeps: 20, rating: 4.8, reviews: 10, guestFavorite: false, distanceMi: 4, isOwn: false, minNights: 1 },
      { id: 'q3', name: 'Comp 3', area: 'Orem', beds: 6, sleeps: 20, rating: 4.8, reviews: 10, guestFavorite: false, distanceMi: 4, isOwn: false, minNights: 1 },
    ],
    index: new Map([
      ['q1', new Map([['2026-11-06', 420]])],
      ['q2', new Map([['2026-11-06', 450]])],
      ['q3', new Map([['2026-11-06', 480]])],
    ]),
  });
  const run = runShadow(board, [], false, '2026-11-06', 'short');
  const night = run.nights[0]!;
  assert.ok(night.offerGuest > night.p75, 'this fixture should leave the offer above the market');
  assert.notEqual(night.action, 'promote', 'a discount that cannot reach the market was offered');
  assert.equal(night.promotionPercent, 0);
  assert.match(night.reason, /highest open comp ask/);
});

test('a two-comp night is checked too, because a thin band deserves more scrutiny', () => {
  /*
   * The first version of the market check required three comps and therefore skipped a night with two —
   * which is backwards. River's 20 and 21 November each had two observed asks and still received a
   * promotion to $1,989 against a highest ask of about $1,558. Fewer observations should mean more caution.
   */
  const board = buildMarketBoard('ranch', '2026-11-06', 1, undefined, {
    comps: [
      { id: 't1', name: 'Comp', area: 'Orem', beds: 6, sleeps: 20, rating: 4.8, reviews: 10, guestFavorite: false, distanceMi: 4, isOwn: false, minNights: 1 },
      { id: 't2', name: 'Comp 2', area: 'Orem', beds: 6, sleeps: 20, rating: 4.8, reviews: 10, guestFavorite: false, distanceMi: 4, isOwn: false, minNights: 1 },
    ],
    index: new Map([
      ['t1', new Map([['2026-11-06', 420]])],
      ['t2', new Map([['2026-11-06', 450]])],
    ]),
  });
  const night0 = board.nights[0]!;
  assert.equal(night0.compRates.length, 2, 'this fixture must carry exactly two asks');

  const run = runShadow(board, [], false, '2026-11-06', 'short');
  const night = run.nights[0]!;
  assert.ok(night.offerGuest > Math.max(...night0.compRates), 'the offer should be above both asks');
  assert.notEqual(night.action, 'promote', 'a two-comp night was promoted above both of its comps');
});

test('a night no stay can cover keeps the published rate', () => {
  const board = buildMarketBoard('river', '2026-11-03', 1);
  const open = board.nights[0]!;
  open.action = 'raise';
  open.proposedGuest = open.ourGuest + 40;
  const run = runShadow(board, ['2026-11-02', '2026-11-04'], false, '2026-11-03', 'short');
  const night = run.nights[0]!;
  assert.equal(night.action, 'hold');
  assert.equal(night.proposedGuest, night.ourGuest);
  assert.equal(night.promotionPercent, 0);
  assert.match(night.reason, /This night cannot be booked/);
  assert.match(run.digest, /1 night cannot be booked\. The published rate stays\./);
  assert.match(run.digest, /No raises today/);
  assert.match(run.digest, /Nothing sent to Hospitable/);
  const pair = buildMarketBoard('river', '2026-11-03', 2);
  const kept = runShadow(pair, ['2026-11-02', '2026-11-05'], false, '2026-11-03', 'short');
  assert.equal(kept.nights.some((row) => row.reason.includes('cannot be booked')), false);
  const friday = buildMarketBoard('ranch', '2026-11-13', 1);
  friday.nights[0]!.action = 'raise';
  friday.nights[0]!.proposedGuest = friday.nights[0]!.ourGuest + 20;
  const lone = runShadow(friday, ['2026-11-12', '2026-11-14'], false, '2026-10-30', 'short');
  assert.equal(lone.nights[0]?.action, 'hold');
  assert.match(lone.nights[0]?.reason ?? '', /cannot be booked/);
  assert.equal(lone.digest.includes('guest'), false);
});

test('a booked night is not promoted', () => {
  const board = buildMarketBoard('ranch', '2026-11-06', 1);
  const run = runShadow(board, ['2026-11-06'], false, '2026-11-06', 'short');
  assert.equal(run.nights[0]?.action, 'booked');
  assert.equal(run.nights[0]?.promotionPercent, 0);
});

test('the daily text names every house and leaves a paused house alone', () => {
  const text = portfolioDigest({
    asOf: '2026-10-29',
    taken: { river: [], ranch: ['2026-11-06'], lindon: [] },
    paused: { river: true, ranch: false, lindon: false },
    pace: { river: 'short', ranch: 'short', lindon: 'met' },
    calendarLive: true,
  });
  assert.match(text, /^UML shadow 2026-10-29/);
  assert.match(text, /River: paused/);
  const eventLine = text.split('\n').find((line) => line.startsWith('Next named event:'));
  assert.match(eventLine ?? '', /BYU vs Arizona State, Oct 30–31/);
  assert.equal((eventLine ?? '').includes('$'), false);
  assert.match(text, /River: \d+ of \d+ sample comps sleep close/);
  assert.match(text, /The rate band uses those/);
  assert.equal(text.split('\n').find((line) => line.includes('sample comps sleep close'))?.includes('$') ?? false, false);
  assert.match(text, /Ranch: \d+ raises, \d+ promotions, [1-9]\d* booked left alone/);
  assert.match(text, /Lindon: \d+ raises, 0 promotions/);
  assert.match(text, /Nothing sent to Hospitable/);
  assert.match(text, /Booking page: River Nov 1 can quote 2, 3, 4, 7, 14, 28 nights/);
  assert.match(text, /Add-ons: .*River Nov 1 can request an early arrival/);
  const calendarLine = text.split('\n').find((line) => line.startsWith('Booking calendar:'));
  assert.match(calendarLine ?? '', /weekend nights show 2 nights/);
  assert.match(calendarLine ?? '', /Nov 23 starts at 4 nights/);
  assert.equal((calendarLine ?? '').includes('$'), false);
  const otherHouses = text.split('\n').find((line) => line.startsWith('Other houses:'));
  assert.match(otherHouses ?? '', /River: Ranch and Lindon will quote the same dates/);
  assert.equal((otherHouses ?? '').includes('$'), false);
  const quiet = portfolioDigest({
    asOf: '2026-10-29',
    taken: { river: [], ranch: [], lindon: [] },
    paused: { river: false, ranch: false, lindon: false },
    pace: { river: 'unknown', ranch: 'unknown', lindon: 'unknown' },
    calendarLive: false,
  });
  assert.equal(quiet.includes('Booking page:'), false);
  assert.equal(quiet.includes('Booking calendar:'), false);
  assert.equal(quiet.includes('Other houses:'), false);
  assert.equal(quiet.includes('Parties:'), false);
  assert.equal(quiet.includes('Children:'), false);
  assert.equal(text.includes('Children:'), false);
  assert.equal(text.includes('Service:'), false);
  assert.equal(text.includes('Arrivals:'), false);
  assert.equal(text.includes('Departures:'), false);
  assert.match(quiet, /The calendar could not be read\. No night is raised or promoted/);
  assert.equal(quiet.includes('raises'), false);
  assert.equal(quiet.includes('$'), false);
  assert.match(quiet, /Nothing sent to Hospitable/);
});

test('the daily text names party size, arrival, and departure without a name or a price', () => {
  const text = portfolioDigest({
    asOf: '2026-10-29',
    taken: { river: [], ranch: [], lindon: [] },
    paused: { river: false, ranch: false, lindon: false },
    pace: { river: 'unknown', ranch: 'unknown', lindon: 'unknown' },
    calendarLive: false,
    stays: [
      { id: 'ranch-1', propertyId: 'ranch', checkIn: '2026-11-04', checkOut: '2026-11-06', status: 'confirmed', partySize: 4, childCount: 1 },
      { id: 'river-1', propertyId: 'river', checkIn: '2026-11-10', checkOut: '2026-11-13', status: 'confirmed', partySize: null },
    ],
    arrivalWindows: { 'ranch-1': '6:00 PM', 'river-1': '801-555-0100' },
    departureWindows: { 'ranch-1': '11:00 AM', 'river-1': 'Ada Lovelace' },
  });
  const parties = text.split('\n').find((line) => line.startsWith('Parties:')) ?? '';
  const arrivals = text.split('\n').find((line) => line.startsWith('Arrivals:')) ?? '';
  const departures = text.split('\n').find((line) => line.startsWith('Departures:')) ?? '';
  const children = text.split('\n').find((line) => line.startsWith('Children:')) ?? '';
  assert.match(parties, /1 stay names a party size/);
  assert.match(children, /Ranch Nov 4, 1 child/);
  assert.equal(children.includes('$'), false);
  assert.match(parties, /River Nov 10/);
  assert.match(arrivals, /Ranch Nov 4, Arrival around 6:00 PM/);
  assert.match(departures, /Ranch Nov 6, Leave at 11:00 AM/);
  assert.match(departures, /River Nov 13/);
  assert.equal(parties.includes('$'), false);
  assert.equal(arrivals.includes('801'), false);
  assert.equal(departures.includes('Ada'), false);
  assert.equal(text.includes('Guest'), false);
  assert.equal(text.includes('Service:'), false);
  assert.match(text, /Nothing sent to Hospitable/);
  const live = portfolioDigest({
    asOf: '2026-10-29',
    taken: { river: [], ranch: [], lindon: [] },
    paused: { river: false, ranch: false, lindon: false },
    pace: { river: 'unknown', ranch: 'unknown', lindon: 'unknown' },
    calendarLive: true,
    stays: [
      { id: 'ranch-1', propertyId: 'ranch', checkIn: '2026-11-04', checkOut: '2026-11-06', status: 'confirmed' },
    ],
  });
  const service = live.split('\n').find((line) => line.startsWith('Service:')) ?? '';
  assert.match(service, /Ranch Nov 6: Leave at 2:00 PM is a request/);
  assert.equal(service.includes('$'), false);
  assert.equal(service.includes('Guest'), false);
});

test('the house panel does not list raises when the calendar is unread', () => {
  const unread = houseShadowText('off', 'Raises 12 · $1,000 → $1,080', '6 of 10 sample comps sleep close to this house.');
  assert.match(unread, /The calendar could not be read/);
  assert.equal(unread.includes('Raises'), false);
  assert.equal(unread.includes('$'), false);
  assert.equal(houseShadowText('loading', 'Raises 1', 'fit'), 'Checking the calendar.');
  const live = houseShadowText('live', 'No raises today.\nNothing sent to Hospitable.', '6 of 10 sample comps sleep close to this house. The rate band uses those 6.');
  assert.match(live, /Nothing sent to Hospitable/);
  assert.match(live, /The rate band uses those 6/);
  assert.equal(live.includes('$'), false);
  assert.equal(raiseHint('off', 4), unread);
  assert.equal(raiseHint('off', 4).includes('4'), false);
  assert.equal(raiseHint('live', 1), '1 shadow raise');
  assert.equal(raiseHint('live', 0), '0 shadow raises');
  assert.match(paceUnreadLine(), /not a stand-in/);
  assert.equal(paceUnreadLine().includes('not on this server'), false);
  assert.equal(paceUnreadLine().includes('$'), false);
  const money = ['ask', 'band', 'comp'] as const;
  for (const where of money) {
    const note = unreadMoneyNote(where);
    assert.equal(note.includes('$'), false);
    assert.match(note, /Nothing is posted/);
  }
  assert.match(unreadMoneyNote('band'), /rate band stays off/);
  assert.match(unreadMoneyNote('comp'), /sample ask stays off/);
});
