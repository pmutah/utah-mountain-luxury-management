/**
 * The request inbox used to ask the host to type a payout with **no price on the screen**, so the
 * number was a guess. These tests pin that the figure the host is shown is the figure the guest was
 * quoted, that an approved night is included, and that an unpriceable stay leaves the field blank
 * rather than inventing a number.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { suggestedPayoutFor, suggestedPayoutLine, suggestedPayouts } from './payout-suggest.ts';
import { stayPlans } from './booking-accept.ts';
import { quoteStay } from './quote.ts';
import { nightAsk } from './market/rates.ts';
import { MAX_DAILY_MOVE } from './market/rate-sheet.ts';

const STAY = { propertyId: 'ranch', checkIn: '2026-12-01', checkOut: '2026-12-04', guests: 8 };

test('the suggested payout is the host net the quote itself produces', () => {
  const row = suggestedPayoutFor('ranch', STAY);
  assert.ok(row);
  const quote = quoteStay('ranch', STAY.checkIn, STAY.checkOut, [], { guests: 8 });
  assert.equal(quote.ok, true);
  // The guest total is exactly the quote total, so the desk cannot disagree with the guest page.
  assert.equal(row.guestTotal, Math.round((quote.stayTotal + Number.EPSILON) * 100) / 100);
  assert.equal(row.hostNet, Math.round((quote.lodging + Number.EPSILON) * 100) / 100);
  assert.equal(row.nights, 3);
  // Cleaning is in the guest total and is not part of the payout line.
  assert.equal(row.cleaning, quote.cleaning);
  assert.equal(row.hostNet, row.guestTotal - row.cleaning);
});

test('an approved night is part of what the host is shown', () => {
  const ask = nightAsk('ranch', STAY.checkIn);
  const lifted = ask.guest + Math.round(ask.guest * MAX_DAILY_MOVE);
  const plain = suggestedPayoutFor('ranch', STAY);
  const withSheet = suggestedPayoutFor('ranch', STAY, { sheet: [{ date: STAY.checkIn, guest: lifted }] });
  assert.ok(plain && withSheet);
  assert.ok(withSheet.hostNet > plain.hostNet, 'an approved night did not raise the suggested payout');
  // And it matches the quote a guest would see with the same sheet.
  const quote = quoteStay('ranch', STAY.checkIn, STAY.checkOut, [], {
    guests: 8,
    sheet: [{ date: STAY.checkIn, guest: lifted }],
  });
  assert.equal(withSheet.guestTotal, Math.round((quote.stayTotal + Number.EPSILON) * 100) / 100);
});

test('a stay that cannot be priced leaves the number blank instead of inventing one', () => {
  assert.equal(suggestedPayoutFor('ranch', { ...STAY, checkIn: '2026-13-01' }), null);
  assert.equal(suggestedPayoutFor('ranch', { ...STAY, checkIn: '', checkOut: '' }), null);
  assert.equal(suggestedPayoutFor('ranch', { ...STAY, checkOut: '2026-12-01' }), null);
  // A party too large for the house is refused by the quote, so there is no payout to show.
  assert.equal(suggestedPayoutFor('lindon', { ...STAY, guests: 40 }), null);
  const line = suggestedPayoutLine([]);
  assert.match(line, /type the payout yourself/);
  assert.equal(line.includes('$'), false, 'a blank state quoted a figure');
});

test('the desk figure per house equals what accept actually writes', () => {
  /*
   * The desk showed River $5,625 and Ranch $1,623, but accept wrote River $5,503.64 and Ranch
   * $1,744.36: the split weighted by guest total, which includes cleaning, while the desk showed host
   * net, which does not. $121.36 landed on the wrong house, and per-house revenue reaches the owner
   * statement. This test is the one that catches that class of drift.
   */
  const request = {
    propertyId: 'river',
    alsoPropertyId: 'ranch',
    checkIn: '2026-12-15',
    checkOut: '2026-12-18',
    guests: 30,
    children: 4,
  };
  const rows = suggestedPayouts(request);
  assert.equal(rows.length, 2);

  // The accept path splits the typed payout by each house's lodging, and the desk types the sum.
  const typed = rows.reduce((sum, row) => sum + row.hostNet, 0);
  const plans = stayPlans({
    propertyId: 'river',
    alsoPropertyId: 'ranch',
    checkIn: request.checkIn,
    checkOut: request.checkOut,
    nights: 3,
    guestName: 'Test',
    note: 'Direct request test.',
    payout: typed,
    source: 'Direct',
    shares: rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.house] = row.hostNet;
      return acc;
    }, {}),
  } as never);

  for (const plan of plans as Array<{ propertyId: string; payout: number }>) {
    const shown = rows.find((row) => row.house === plan.propertyId);
    assert.ok(shown, `the desk showed no row for ${plan.propertyId}`);
    assert.equal(
      Math.round(plan.payout * 100),
      Math.round(shown.hostNet * 100),
      `${plan.propertyId}: the desk showed ${shown.hostNet} but accept wrote ${plan.payout}`,
    );
  }
  // The parts still add up to the whole.
  const written = (plans as Array<{ payout: number }>).reduce((sum, p) => sum + Math.round(p.payout * 100), 0);
  assert.equal(written, Math.round(typed * 100), 'the two houses did not add back to the typed payout');
});

test('a two-house request shows one payout per house', () => {
  const rows = suggestedPayouts({
    propertyId: 'river',
    alsoPropertyId: 'ranch',
    checkIn: '2026-12-01',
    checkOut: '2026-12-04',
    guests: 30,
    children: 2,
  });
  assert.equal(rows.length, 2, 'a two-house request did not show both houses');
  assert.deepEqual(rows.map((r) => r.house), ['river', 'ranch']);
  const line = suggestedPayoutLine(rows);
  assert.match(line, /Two houses/);
  assert.match(line, /River/);
  assert.match(line, /Ranch/);
  // The total it names is the sum of the two, not one of them.
  const total = rows.reduce((sum, r) => sum + r.hostNet, 0);
  const formatted = total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  assert.match(line, new RegExp(formatted.replace(/[.]/g, '\\.')), `the total $${formatted} is not on the line`);
});

test('a two-house party too small for both houses shows no figure', () => {
  // The River House Sleeps 24, so 10 guests cannot be split across both.
  const rows = suggestedPayouts({
    propertyId: 'river',
    alsoPropertyId: 'ranch',
    checkIn: '2026-12-01',
    checkOut: '2026-12-04',
    guests: 10,
  });
  assert.deepEqual(rows, []);
});

test('an unnamed or unknown house produces nothing rather than a guess', () => {
  assert.deepEqual(suggestedPayouts({ ...STAY, propertyId: 'garage' }), []);
  assert.deepEqual(suggestedPayouts({ ...STAY, propertyId: undefined }), []);
  // The same house named twice is one stay, not two.
  const one = suggestedPayouts({ ...STAY, propertyId: 'ranch', alsoPropertyId: 'ranch' });
  assert.equal(one.length, 1);
});

test('the desk line names the guest total and the payout, and they are different numbers', () => {
  const rows = suggestedPayouts(STAY);
  const line = suggestedPayoutLine(rows);
  assert.match(line, /guest was quoted/);
  assert.match(line, /payout for this house/);
  const row = rows[0]!;
  assert.notEqual(row.guestTotal, row.hostNet, 'the guest total was shown as the payout');
});

test('one house never reads another house’s approved price', () => {
  /*
   * The inbox passed both houses' approved rows in one list, and a row is matched by date alone.
   * Row order therefore decided which house's approval applied: the same two-house request priced
   * three different ways, and one ordering put the Ranch's approved rate onto the River House.
   * A per-house map removes the ambiguity at the source.
   */
  const river = { date: '2026-11-01', guest: nightAsk('river', '2026-11-01').guest + 100 };
  const ranch = { date: '2026-11-01', guest: nightAsk('ranch', '2026-11-01').guest + 100 };
  const request = {
    propertyId: 'river' as const,
    alsoPropertyId: 'ranch' as const,
    checkIn: '2026-11-01',
    checkOut: '2026-11-03',
    guests: 30,
  };

  const sheeted = suggestedPayouts(request, { sheets: { river: [river], ranch: [ranch] } });
  assert.equal(sheeted.length, 2);
  const byHouse = new Map(sheeted.map((row) => [row.house, row]));

  // Each house matches a single-house quote with only its own approved night in hand.
  for (const [house, party, own] of [
    ['river', 24, river],
    ['ranch', 6, ranch],
  ] as const) {
    const solo = suggestedPayoutFor(
      house,
      { checkIn: request.checkIn, checkOut: request.checkOut, guests: party },
      { sheet: [own] },
    );
    assert.ok(solo, `${house} could not be priced on its own`);
    assert.equal(
      byHouse.get(house)!.hostNet,
      solo.hostNet,
      `${house} was priced from a sheet that was not its own`,
    );
  }
});

test('the two-house payout does not depend on the order the sheet was stored in', () => {
  const river = { date: '2026-11-01', guest: nightAsk('river', '2026-11-01').guest + 100 };
  const ranch = { date: '2026-11-01', guest: nightAsk('ranch', '2026-11-01').guest + 100 };
  const request = {
    propertyId: 'river' as const,
    alsoPropertyId: 'ranch' as const,
    checkIn: '2026-11-01',
    checkOut: '2026-11-03',
    guests: 30,
  };
  const forward = suggestedPayouts(request, { sheets: { river: [river], ranch: [ranch] } });
  const reversed = suggestedPayouts(request, { sheets: { ranch: [ranch], river: [river] } });
  assert.deepEqual(
    forward,
    reversed,
    'the same approved sheet produced two different payouts depending on map order',
  );
});

test('a per-house map does not fall back to the flat list for a house it does not describe', () => {
  // Falling back would reintroduce the leak: a flat list holds every house's rows, and the match is
  // by date, so a house with no entry of its own would pick up its neighbour's approved price.
  const ranch = { date: '2026-11-01', guest: nightAsk('ranch', '2026-11-01').guest + 100 };
  const request = { propertyId: 'river' as const, checkIn: '2026-11-01', checkOut: '2026-11-03', guests: 25 };
  const withMap = suggestedPayouts(request, { sheets: { ranch: [ranch] }, sheet: [ranch] });
  const cardOnly = suggestedPayouts(request);
  assert.deepEqual(withMap, cardOnly, 'a house with no rows of its own read the flat list');
});
