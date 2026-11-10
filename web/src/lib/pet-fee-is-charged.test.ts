import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { quoteStay } from './quote.ts';
import { declaredDogs, MAX_DOGS, petFeeFor, PET_FEE } from './house-rules.ts';

/*
 * The owner set a pet fee and nobody was ever charged it.
 *
 * The policy has been published on the booking page since 2026-11-10 — dogs only, up to two, under 50 lb, no cats — and
 * `PET_FEE = 149` has sat in `house-rules.ts` since then. `grep PET_FEE` over the whole app found exactly two hits: the
 * constant and a test asserting it equals 149. **No quote, no request, and no surface used it.**
 *
 * So a guest with a dog read "$149 per stay" on the page, requested the stay, and owed nothing. The host lost the fee and
 * never learned a dog was coming, because the request payload had no field for it either.
 *
 * These guards pin the fee to the money the guest actually sees, and pin the owner's per-stay rule so it cannot drift into
 * per-dog or per-night.
 */

const QUOTE = readFileSync(join(process.cwd(), 'src', 'lib', 'quote.ts'), 'utf8');
const PAGE = readFileSync(join(process.cwd(), 'src', 'components', 'DirectBook.tsx'), 'utf8');
const ROUTE = readFileSync(join(process.cwd(), 'functions', 'api', 'book', 'index.ts'), 'utf8');

const ASOF = { asOf: '2026-11-10' } as const;

test('one dog adds the owner fee to the guest total', () => {
  const none = quoteStay('lindon', '2026-12-01', '2026-12-04', [], ASOF);
  const one = quoteStay('lindon', '2026-12-01', '2026-12-04', [], { ...ASOF, dogs: 1 });
  assert.equal(one.petFee, PET_FEE, 'one dog did not add the fee');
  assert.equal(one.stayTotal - none.stayTotal, PET_FEE, 'the total did not move by the fee');
  // And the fee must be in the total, not merely reported beside it.
  assert.equal(one.stayTotal, one.lodging + one.cleaning + one.petFee, 'the fee is not part of the total');
});

test('two dogs cost one stay fee, and three clamp to two', () => {
  /*
   * The owner's rule is per stay — "$149/stay" — so a second dog must not double the charge. This is the number most likely to
   * drift: a per-night or per-dog reading would both look plausible in code.
   */
  const one = quoteStay('lindon', '2026-12-01', '2026-12-04', [], { ...ASOF, dogs: 1 });
  const two = quoteStay('lindon', '2026-12-01', '2026-12-04', [], { ...ASOF, dogs: 2 });
  assert.equal(two.petFee, PET_FEE, 'the second dog doubled the fee');
  assert.equal(two.stayTotal, one.stayTotal, 'two dogs cost more than one');
  assert.equal(petFeeFor(3), PET_FEE, 'a third dog invented a higher fee');
});

test('the fee is per stay, not per night', () => {
  // A one-night and a seven-night stay with one dog must carry the same fee.
  const short = quoteStay('lindon', '2026-12-01', '2026-12-02', [], { ...ASOF, dogs: 1 });
  const long = quoteStay('lindon', '2026-12-01', '2026-12-08', [], { ...ASOF, dogs: 1 });
  assert.equal(short.petFee, PET_FEE);
  assert.equal(long.petFee, PET_FEE, 'the fee scaled with the nights');
});

test('a guest with no declared dogs is never charged', () => {
  /*
   * The dangerous direction: charging everyone. Absent, zero, a negative, a fraction, a string, and null must all be free.
   */
  for (const dogs of [undefined, 0, -1, 1.5, '2', null, Number.NaN]) {
    assert.equal(petFeeFor(dogs), 0, `${String(dogs)} produced a pet fee`);
  }
  const quote = quoteStay('ranch', '2026-12-01', '2026-12-04', [], ASOF);
  assert.equal(quote.petFee, 0, 'a quote with no dogs carried a fee');
});

test('a declared count is refused rather than guessed', () => {
  // `declaredDogs` is what the route stores, so a junk body cannot record "5 dogs" or a negative.
  assert.equal(declaredDogs(1), 1);
  assert.equal(declaredDogs(0), 0, 'an explicit zero is a real answer');
  assert.equal(declaredDogs(5), MAX_DOGS, 'an over-limit count was not clamped');
  for (const bad of [-1, 1.5, '2', null, undefined, Number.NaN]) {
    assert.equal(declaredDogs(bad), null, `${String(bad)} was accepted as a dog count`);
  }
});

test('the guest can declare a dog on the page', () => {
  assert.match(PAGE, /data-bot="stay-dogs"/, 'the booking page has no dog field');
  // The fee must be named where the guest is looking at the total.
  assert.match(PAGE, /data-bot="stay-pet-fee"/, 'the page does not name the fee it is charging');
  // And the count must reach the quote, or the field is decoration.
  assert.ok(PAGE.includes('dogs: dogCount'), 'the declared dogs never reach the quote');
  assert.ok(PAGE.includes('{ dogs: dogCount }'), 'the declared dogs are not sent with the request');
});

test('the request stores the declared dogs', () => {
  assert.match(ROUTE, /dogs\?: number/, 'the request type has no dogs field');
  assert.match(ROUTE, /declaredDogs\(body\.dogs\)/, 'the route does not read a declared dog count');
});

test('the quote keeps the fee as its own line', () => {
  /*
   * Folding it into `cleaning` would have been easier and would have hidden it: the guest would see one larger number with no
   * explanation, and the host could not tell a pet fee from a cleaning fee on the same booking.
   */
  assert.match(QUOTE, /petFee: number/, 'the quote has no petFee field');
  assert.match(QUOTE, /stayTotal: lodging \+ cleaning \+ petFee/, 'the fee is not in the total');
  // The `cleaning` assignment itself must not absorb the fee. Matching the field, not any line that mentions both.
  const cleaningLine = /^\s*cleaning:\s*(.+),$/m.exec(QUOTE);
  assert.ok(cleaningLine, 'the cleaning line could not be found');
  assert.equal(
    /petFee/.test(cleaningLine[1]!),
    false,
    `the fee was folded into the cleaning line: ${cleaningLine[0].trim()}`,
  );
});
