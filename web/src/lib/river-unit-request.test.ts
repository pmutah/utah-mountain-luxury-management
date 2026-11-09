import assert from 'node:assert/strict';
import test from 'node:test';
import { blankUnitRates, sellableUnits, type RiverUnitRates } from './river-unit-rates.ts';
import { RIVER_UNITS, riverAvailability, type UnitSpan } from './river-units.ts';
import { unitOffers, unitRequestCheck } from './river-unit-request.ts';

/*
 * The Riverhouse is one house sold four ways, so the only failure that really matters is a night sold twice. These
 * tests are the truth table: whole booked, one part booked, two parts together, all three, and cancelling.
 *
 * They also pin the second rule, which is easier to get wrong than the first: a part with **no price** is not
 * sellable. Quoting a guest a rate for an unpriced listing is the same class of defect as showing an invented comp
 * rate, so it is refused with a reason rather than offered.
 */

/** All three parts priced, which is the state after the host sets them up. */
function allPriced(): RiverUnitRates {
  const rates = blankUnitRates();
  rates['garage-suite'] = { nightly: 320, cleaning: 150, minNights: 2 };
  rates['recreation-wing'] = { nightly: 640, cleaning: 250, minNights: 2 };
  rates['main-lodge'] = { nightly: 1150, cleaning: 400, minNights: 2 };
  return rates;
}

const span = (over: Partial<UnitSpan>): UnitSpan => ({
  propertyId: 'river',
  checkIn: '2026-12-10',
  checkOut: '2026-12-13',
  ...over,
});

test('all three parts start unpriced and none can be booked', () => {
  const rates = blankUnitRates();
  assert.deepEqual(sellableUnits(rates), []);
  for (const unit of RIVER_UNITS) {
    const check = unitRequestCheck([], rates, {
      units: [unit],
      checkIn: '2026-12-10',
      checkOut: '2026-12-12',
      guests: 2,
    });
    assert.equal(check.ok, false, `${unit} was bookable with no price`);
    if (!check.ok) {
      assert.equal(check.code, 'unpriced');
      assert.match(check.reason, /no price yet/i);
    }
  }
});

test('the whole house is bookable with no part priced, because it is not sold as a part', () => {
  const check = unitRequestCheck([], blankUnitRates(), { checkIn: '2026-12-10', checkOut: '2026-12-12', guests: 10 });
  assert.equal(check.ok, true, 'the whole house needed a part to be priced');
  if (check.ok) {
    assert.equal(check.wholeHouse, true);
    assert.deepEqual(check.units, []);
    // Whole-house stays block all three parts, so they must carry all three.
    assert.deepEqual(check.spans[0]?.units, [...RIVER_UNITS]);
    assert.equal(check.spans.length, 1, 'a whole-house stay became more than one reservation');
  }
});

test('a whole-house booking blocks every part', () => {
  const spans = [span({ status: 'confirmed' })];
  for (const unit of RIVER_UNITS) {
    const check = unitRequestCheck(spans, allPriced(), {
      units: [unit],
      checkIn: '2026-12-11',
      checkOut: '2026-12-12',
      guests: 2,
    });
    assert.equal(check.ok, false, `${unit} was bookable while the whole house was taken`);
    if (!check.ok) assert.equal(check.code, 'taken');
  }
});

test('one part booked leaves the other two sellable and blocks the house', () => {
  const spans = [span({ units: ['recreation-wing'], status: 'confirmed' })];
  const rates = allPriced();
  for (const unit of ['garage-suite', 'main-lodge'] as const) {
    const check = unitRequestCheck(spans, rates, {
      units: [unit],
      checkIn: '2026-12-11',
      checkOut: '2026-12-12',
      guests: 2,
    });
    assert.equal(check.ok, true, `${unit} was blocked by the Recreation Wing`);
  }
  const house = unitRequestCheck(spans, rates, { checkIn: '2026-12-11', checkOut: '2026-12-12', guests: 10 });
  assert.equal(house.ok, false, 'the whole house was bookable while a part was taken');
});

test('two parts together are one reservation and leave the third sellable', () => {
  const rates = allPriced();
  const check = unitRequestCheck([], rates, {
    units: ['garage-suite', 'main-lodge'],
    checkIn: '2026-12-10',
    checkOut: '2026-12-12',
    guests: 8,
  });
  assert.equal(check.ok, true);
  if (!check.ok) return;
  assert.equal(check.spans.length, 1, 'two parts became two reservations');
  assert.deepEqual(check.spans[0]?.units, ['garage-suite', 'main-lodge']);
  assert.equal(check.spans[0]?.wholeHouse, false);
  assert.equal(check.sleeps, 17, 'the combined capacity is wrong');

  // Those nights now block the house and both parts, and leave the Recreation Wing free.
  const spans: UnitSpan[] = check.spans.map((s) => ({ ...span({}), units: s.units, wholeHouse: s.wholeHouse }));
  const availability = riverAvailability(spans, '2026-12-10', '2026-12-12');
  assert.deepEqual(availability.units['garage-suite'], []);
  assert.deepEqual(availability.units['main-lodge'], []);
  assert.deepEqual(availability.units['recreation-wing'], ['2026-12-10', '2026-12-11']);
  assert.deepEqual(availability.wholeHouse, []);
});

test('all three parts together leave nothing free', () => {
  const rates = allPriced();
  const check = unitRequestCheck([], rates, {
    units: [...RIVER_UNITS],
    checkIn: '2026-12-10',
    checkOut: '2026-12-12',
    guests: 20,
  });
  assert.equal(check.ok, true);
  if (!check.ok) return;
  const spans: UnitSpan[] = check.spans.map((s) => ({ ...span({}), units: s.units }));
  const availability = riverAvailability(spans, '2026-12-10', '2026-12-12');
  for (const unit of RIVER_UNITS) assert.deepEqual(availability.units[unit], [], `${unit} stayed free`);
  assert.deepEqual(availability.wholeHouse, []);
});

test('cancelling a part reopens the house and that part', () => {
  const rates = allPriced();
  const cancelled = [span({ units: ['main-lodge'], status: 'cancelled' })];
  const check = unitRequestCheck(cancelled, rates, {
    units: ['main-lodge'],
    checkIn: '2026-12-11',
    checkOut: '2026-12-12',
    guests: 3,
  });
  assert.equal(check.ok, true, 'a cancelled stay still blocked its part');
  const house = unitRequestCheck(cancelled, rates, { checkIn: '2026-12-11', checkOut: '2026-12-12', guests: 10 });
  assert.equal(house.ok, true, 'a cancelled stay still blocked the house');
});

test('a party larger than the parts is refused with the real number', () => {
  const check = unitRequestCheck([], allPriced(), {
    units: ['garage-suite'],
    checkIn: '2026-12-10',
    checkOut: '2026-12-12',
    guests: 9,
  });
  assert.equal(check.ok, false);
  if (!check.ok) {
    assert.equal(check.code, 'over-capacity');
    assert.match(check.reason, /sleeps 4/);
    assert.match(check.reason, /9/);
  }
});

test('a part nobody sells is refused by name, not silently dropped', () => {
  const check = unitRequestCheck([], allPriced(), {
    units: ['attic'],
    checkIn: '2026-12-10',
    checkOut: '2026-12-12',
    guests: 2,
  });
  assert.equal(check.ok, false);
  if (!check.ok) assert.equal(check.code, 'unknown-unit');
});

test('a half-priced part is refused and says it is not fully priced', () => {
  const rates = allPriced();
  rates['recreation-wing'] = { nightly: 640, cleaning: null, minNights: 2 };
  const check = unitRequestCheck([], rates, {
    units: ['recreation-wing'],
    checkIn: '2026-12-10',
    checkOut: '2026-12-12',
    guests: 4,
  });
  assert.equal(check.ok, false);
  if (!check.ok) {
    assert.equal(check.code, 'unpriced');
    assert.match(check.reason, /not fully priced/i);
  }
});

test('the parts requested are described the same way whatever order they arrive in', () => {
  const a = unitRequestCheck([], allPriced(), {
    units: ['main-lodge', 'garage-suite'],
    checkIn: '2026-12-10',
    checkOut: '2026-12-12',
    guests: 4,
  });
  const b = unitRequestCheck([], allPriced(), {
    units: ['garage-suite', 'main-lodge', 'garage-suite'],
    checkIn: '2026-12-10',
    checkOut: '2026-12-12',
    guests: 4,
  });
  assert.equal(a.ok && b.ok, true);
  if (!a.ok || !b.ok) return;
  assert.deepEqual(a.units, b.units, 'the same parts resolved differently');
  assert.equal(a.line, b.line);
});

test('offers name why a part cannot be booked, and never show a price for an unpriced part', () => {
  const rates = blankUnitRates();
  rates['garage-suite'] = { nightly: 320, cleaning: 150, minNights: 2 };
  const spans = [span({ units: ['garage-suite'], status: 'confirmed' })];
  const offers = unitOffers(spans, rates, '2026-12-11', '2026-12-12');
  const garage = offers.find((offer) => offer.unit === 'garage-suite');
  const wing = offers.find((offer) => offer.unit === 'recreation-wing');
  assert.ok(garage && wing);
  assert.equal(garage.nightly, 320);
  assert.equal(garage.available, false);
  assert.match(garage.reason ?? '', /Booked on 2026-12-11/);
  // The unpriced part shows no number at all.
  assert.equal(wing.nightly, null);
  assert.equal(wing.available, false);
  assert.match(wing.reason ?? '', /no price yet/i);
});

test('an offer with no free night is unbookable but still states its price', () => {
  const rates = allPriced();
  const offers = unitOffers([], rates, '2026-12-10', '2026-12-12');
  for (const offer of offers) {
    assert.equal(offer.available, true, `${offer.unit} was not offered with no bookings`);
    assert.ok(offer.nightly !== null && offer.nightly > 0, `${offer.unit} was offered without a price`);
  }
  // Without dates nothing is claimed available, and nothing is refused either.
  const undated = unitOffers([], rates, '', '');
  for (const offer of undated) {
    assert.equal(offer.available, false);
    assert.equal(offer.reason, null);
  }
});

test('a closed stretch refuses the booking and is not called a booking', () => {
  const closed = [span({ checkIn: '2026-12-11', checkOut: '2026-12-13' })];
  const check = unitRequestCheck([], allPriced(), { checkIn: '2026-12-10', checkOut: '2026-12-12', guests: 6 }, closed);
  assert.equal(check.ok, false);
  if (!check.ok) {
    assert.equal(check.code, 'closed', 'a closed night was reported as taken');
    assert.match(check.reason, /closed on 2026-12-11/);
    assert.equal(/booked/i.test(check.reason), false, 'a closed night was described as booked');
  }
  // A closed house also closes every part.
  const part = unitRequestCheck([], allPriced(), {
    units: ['main-lodge'],
    checkIn: '2026-12-11',
    checkOut: '2026-12-12',
    guests: 4,
  }, closed);
  assert.equal(part.ok, false);
  if (!part.ok) assert.equal(part.code, 'closed');
});

test('a closed night never reads as available on an offer', () => {
  const closed = [span({ checkIn: '2026-12-11', checkOut: '2026-12-13' })];
  const offers = unitOffers([], allPriced(), '2026-12-10', '2026-12-12', closed);
  for (const offer of offers) {
    assert.equal(offer.available, false, `${offer.unit} was offered on a closed night`);
    assert.match(offer.reason ?? '', /closed/i);
  }
});

test('a block outside the dates asked about does not refuse the stay', () => {
  const closed = [span({ checkIn: '2026-12-20', checkOut: '2026-12-24' })];
  const check = unitRequestCheck([], allPriced(), { checkIn: '2026-12-10', checkOut: '2026-12-12', guests: 6 }, closed);
  assert.equal(check.ok, true, 'a block in another week refused these dates');
});
