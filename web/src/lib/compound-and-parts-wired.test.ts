import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { compoundOffer } from './compound.ts';
import { quoteWithTax } from './platform/guest-ops.ts';
import { partSharedHouseLine, unitStayOffers, unitsTogetherSleeps, unitsTogetherTotal } from './river-unit-offers.ts';
import { PUBLISHED_UNIT_RATES } from './river-unit-rates.ts';
import { RIVER_UNIT_DETAIL } from './river-units.ts';

const CARD = readFileSync(join(process.cwd(), 'src', 'components', 'DirectReserveCard.tsx'), 'utf8');
const LISTING = readFileSync(join(process.cwd(), 'src', 'components', 'HouseListing.tsx'), 'utf8');
const WING_MAP = readFileSync(join(process.cwd(), 'src', 'components', 'RiverWingMap.tsx'), 'utf8');

test('a 23-to-42 guest group can actually quote and request River + Ranch together', () => {
  /*
   * `quoteStay('river', ..., { guests: 30 })` returns `ok: false` because one house sleeps 22. Requiring `quote.ok &&
   * party.ok` unconditionally locked every two-house group out of the request form and printed "The River House sleeps 22."
   */
  const offer = compoundOffer(
    '2026-12-10',
    '2026-12-13',
    30,
    4,
    { river: [], ranch: [], lindon: [] },
    '2026-11-12',
    () => 'unknown',
    { river: [], ranch: [], lindon: [] },
  );
  assert.equal(offer.show, true);
  assert.equal(offer.ok, true);

  assert.match(CARD, /const bothHousesReady = twoHouse && calendar === 'live' && rulesRead && !eventStay/, 'two-house readiness does not unlock the form');
  assert.match(CARD, /const houseReady = singleHouseReady \|\| bothHousesReady/, 'houseReady still blocks a two-house group on single-house quote.ok');
  assert.match(CARD, /\(id\) => pace\[id\] \?\? 'unknown'/, 'compoundOffer drops the fill promotion by hardcoding unknown pace');
  assert.match(CARD, /closedWithHeld/, 'compoundOffer ignores held nights on the second house');
  assert.match(CARD, /compoundTotal \?\? quote\.stayTotal/, 'a two-house request does not send the compound total as quotedTotal');
  assert.match(CARD, /bothHouseRequestNote\(\)/, 'a two-house request omits the two-house arrival and parking note');
});

test('a held night on Ranch blocks a two-house compound offer just like a closed night', () => {
  const blocked = compoundOffer(
    '2026-12-10',
    '2026-12-13',
    30,
    0,
    { river: [], ranch: [], lindon: [] },
    '2026-11-12',
    () => 'unknown',
    { river: [], ranch: ['2026-12-11'], lindon: [] },
  );
  assert.equal(blocked.show, true);
  assert.equal(blocked.ok, false);
  if (blocked.show && !blocked.ok) {
    assert.match(blocked.reason, /Ranch:/);
  }
});

test('part bookings disclose the shared house, compute part-level tax, and block party/event stays', () => {
  const offers = unitStayOffers(
    RIVER_UNIT_DETAIL.map((unit) => ({
      ...unit,
      nightly: PUBLISHED_UNIT_RATES[unit.id].nightly,
      cleaning: PUBLISHED_UNIT_RATES[unit.id].cleaning,
      minNights: PUBLISHED_UNIT_RATES[unit.id].minNights,
      rateState: 'ready' as const,
      nights: ['2026-12-10', '2026-12-11'],
    })),
    '2026-12-10',
    '2026-12-12',
  );
  const garage = offers.filter((offer) => offer.unit.id === 'garage-suite');
  assert.equal(unitsTogetherTotal(garage), 650);
  assert.match(partSharedHouseLine(garage) ?? '', /part of a shared house/);
  // Selecting all three wings caps at the house's 22-guest limit, not the raw 24 sum.
  assert.equal(unitsTogetherSleeps(offers), 22);

  const partTax = quoteWithTax({ lodging: 530, cleaning: 120, pet: 0 });
  const wholeTax = quoteWithTax({ lodging: 3600, cleaning: 550, pet: 0 });
  assert.ok(partTax.estimatedTotal < wholeTax.estimatedTotal);

  assert.match(CARD, /data-bot="stay-parts-shared"/, 'the reserve card hides the shared-house disclosure from part guests');
  assert.match(CARD, /const partReady =[\s\S]*?!eventStay;/, 'ticking party/event does not block a part booking');
  const taxBlock = CARD.slice(CARD.indexOf('data-bot="stay-tax-estimate"') - 200, CARD.indexOf('data-bot="stay-tax-estimate"') + 650);
  assert.match(taxBlock, /bookingParts/, 'the tax estimate still uses the whole-house lodging when a part is chosen');
});

test('RiverWingMap and DirectReserveCard share chosen wings and unit availability on HouseListing', () => {
  assert.match(LISTING, /const \[chosenParts, setChosenParts\] = useState<RiverUnitId\[\]>\(\[\]\)/, 'HouseListing does not hold shared wing selection');
  assert.match(LISTING, /<RiverWingMap[\s\S]*?selected=\{chosenParts\}[\s\S]*?onChange=\{setChosenParts\}/, 'RiverWingMap is not wired to chosenParts');
  assert.match(LISTING, /<DirectReserveCard[\s\S]*?chosenParts=\{chosenParts\}[\s\S]*?onChosenParts=/, 'DirectReserveCard is not wired to chosenParts');
  assert.match(WING_MAP, /selected: controlledSelected/, 'RiverWingMap does not accept a controlled selection');
});

test('entering a fitting guest count keeps nightly prices visible on StayMonth', () => {
  assert.equal(/prices=\{guestCount === null\}/.test(LISTING), false, 'typing any guest count hides nightly prices on the calendar');
  assert.match(LISTING, /partyFits\(house\.id, guestCount/, 'StayMonth prices are not kept on for fitting parties');
});
