import assert from 'node:assert/strict';
import test from 'node:test';
import { blankUnitRates, type RiverUnitRates } from './river-unit-rates.ts';
import { partFacts, partPromptLines } from './part-facts.ts';
import type { RiverDayInput } from './river-calendar.ts';

/*
 * The co-host was told the River House "sleeps 22" and nothing else, so it described a house that can only be rented
 * whole. Two failures follow from that, and both are the kind a host acts on:
 *
 *   - asked "can I still sell Saturday?" it would say no whenever any part was taken, which is the rule inverted;
 *   - asked "what should I charge for the Lodge?" it had no idea a part even existed.
 *
 * These tests hold the fact line to the same truth the calendar and the booking route use.
 */

function priced(): RiverUnitRates {
  const rates = blankUnitRates();
  rates['garage-suite'] = { nightly: 320, cleaning: 150, minNights: 2 };
  rates['main-lodge'] = { nightly: 1150, cleaning: 400, minNights: 2 };
  return rates;
}

const span = (over: Partial<RiverDayInput> = {}): RiverDayInput => ({
  propertyId: 'river',
  checkIn: '2026-12-10',
  checkOut: '2026-12-13',
  status: 'confirmed',
  ...over,
});

test('the parts line names every part with its capacity', () => {
  const facts = partFacts(priced(), [], '2026-12-01');
  assert.match(facts.partsLine, /Garage Suite 4/);
  assert.match(facts.partsLine, /Recreation Wing 8/);
  assert.match(facts.partsLine, /Main Lodge 10/);
});

test('the parts line says a night is sold once and that a part blocks the house', () => {
  const facts = partFacts(priced(), [], '2026-12-01');
  assert.match(facts.partsLine, /sold once/);
  assert.match(facts.partsLine, /blocks the whole house/);
});

test('the parts line says the parts and the house agree', () => {
  /*
   * This asserted that the line stated a *gap* — the parts summed to 25 against a 24-guest house. The owner settled it at 22
   * on 2026-11-10 (the Main Lodge sleeps 10, not 13), so the two figures now agree and the line says so instead. The test
   * still holds the important thing: the line names the sum it claims, rather than leaving a host to add up the parts.
   */
  const facts = partFacts(priced(), [], '2026-12-01');
  assert.match(facts.partsLine, /sum to 22/, 'the parts line does not name the sum');
  assert.match(facts.partsLine, /the same as the house/, 'the parts line does not say the parts and the house agree');
});

test('with no part priced the prompt forbids quoting a part', () => {
  const facts = partFacts(blankUnitRates(), [], '2026-12-01');
  assert.equal(facts.priced, 0);
  const lines = partPromptLines(facts);
  assert.match(lines.join(' '), /No part has a price yet/);
  assert.match(lines.join(' '), /do not invent a nightly rate/i);
});

test('a partly priced house names the count and still forbids quoting the rest', () => {
  const facts = partFacts(priced(), [], '2026-12-01');
  assert.equal(facts.priced, 2);
  const lines = partPromptLines(facts);
  assert.match(lines.join(' '), /2 of 3 parts are priced/);
  assert.match(lines.join(' '), /not sellable/);
});

test('a price sheet that could not be read is not reported as unpriced', () => {
  const facts = partFacts(null, [], '2026-12-01');
  // Null is "unknown", never zero — the model must not tell a host nothing is for sale.
  assert.equal(facts.priced, null);
  const lines = partPromptLines(facts);
  assert.match(lines[0] ?? '', /Garage Suite 4/);
  assert.equal(/No part has a price yet/.test(lines.join(' ')), false, 'an unreadable sheet was called unpriced');
  assert.match(lines.join(' '), /could not be read/);
});

test('a night with one part sold is reported as still sellable, not as sold out', () => {
  const facts = partFacts(priced(), [span({ units: ['main-lodge'] })], '2026-12-10', 3);
  const first = facts.openNights[0];
  assert.equal(first?.date, '2026-12-10');
  assert.deepEqual(first?.free, ['garage-suite', 'recreation-wing']);
  const lines = partPromptLines(facts).join(' ');
  assert.match(lines, /Garage Suite and Recreation Wing free/);
  assert.equal(/nothing free/.test(lines), false, 'a night with two parts left was called sold out');
});

test('a whole-house booking is reported as nothing free', () => {
  const facts = partFacts(priced(), [span()], '2026-12-10', 3);
  assert.deepEqual(facts.openNights[0]?.free, []);
  assert.match(partPromptLines(facts).join(' '), /2026-12-10 \(nothing free\)/);
});

test('the window never starts before the day asked about', () => {
  const facts = partFacts(priced(), [], '2026-12-20', 2);
  assert.equal(facts.openNights[0]?.date, '2026-12-20');
  assert.ok(facts.openNights.every((night) => night.date >= '2026-12-20'));
});

test('the fact line states the dates it covers, so it cannot be read as every future date', () => {
  /*
   * Asked about a night a year out, the co-host answered that the Main Lodge and the whole house were both free — on a
   * night a whole-house stay already covered. The prompt only carried the next few nights, and the line read
   * "sellability from <date>" with no end, so the model had nothing telling it where its knowledge stopped.
   */
  const facts = partFacts(priced(), [], '2026-12-01', 5);
  const lines = partPromptLines(facts).join(' ');
  const first = facts.openNights[0]!.date;
  const last = facts.openNights[facts.openNights.length - 1]!.date;
  assert.match(lines, new RegExp(`checked only for ${first} through ${last}`), 'the line does not name its window');
  assert.match(lines, /outside .* to .* you have no availability data/i, 'the model is not told the window ends');
  assert.match(lines, /Do not say a date is free, booked, or sellable/i, 'the prohibition is not stated');
});

test('a night with one part sold is named as still sellable inside the window', () => {
  // The window statement must not weaken the real data it carries.
  const facts = partFacts(priced(), [span({ units: ['main-lodge'] })], '2026-12-10', 3);
  const lines = partPromptLines(facts).join(' ');
  assert.match(lines, /Garage Suite and Recreation Wing free/);
  assert.match(lines, /through/);
});
