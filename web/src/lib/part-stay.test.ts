import assert from 'node:assert/strict';
import test from 'node:test';
import {
  partGuestHasWholeHouse,
  partStayCapacityLine,
  partStayFrom,
  partStayLabel,
  partStayLine,
} from './part-stay.ts';

/*
 * A guest who booked the Garage Suite is in a house other people may also be in. The portal said nothing about that, so
 * the guest read a whole-house guide: sleeps 24, the run of the building. That is the defect these tests hold shut.
 *
 * The copy also has a privacy job: it must explain that other guests may be here without ever naming them or hinting who
 * they are.
 */

test('a stay with no units is the whole house, which is every stay recorded before parts existed', () => {
  const stay = partStayFrom(undefined);
  assert.equal(stay.wholeHouse, true);
  assert.deepEqual(stay.units, []);
  assert.equal(stay.sleeps, 24);
  // Nothing to explain to a whole-house guest, so no line appears.
  assert.equal(partStayLine(stay), null);
  assert.equal(partStayCapacityLine(stay), null);
  assert.equal(partStayLabel(stay), null);
});

test('an empty list is also the whole house, not a stay in nothing', () => {
  assert.equal(partStayFrom([]).wholeHouse, true);
});

test('one part names itself and says the rest of the house may be booked', () => {
  const stay = partStayFrom(['garage-suite']);
  assert.equal(stay.wholeHouse, false);
  assert.deepEqual(stay.names, ['River Garage Suite']);
  assert.equal(stay.sleeps, 4);
  const line = partStayLine(stay);
  assert.ok(line);
  assert.match(line, /This stay is for Garage Suite/);
  assert.match(line, /sleeps 4/);
  assert.match(line, /may be booked by other guests/);
});

test('two parts describe both and only the third as elsewhere', () => {
  const stay = partStayFrom(['main-lodge', 'garage-suite']);
  // Canonical order, so the same stay always reads the same way.
  assert.deepEqual(stay.units, ['garage-suite', 'main-lodge']);
  assert.equal(stay.sleeps, 17);
  const line = partStayLine(stay) ?? '';
  assert.match(line, /Garage Suite and Main Lodge/);
  assert.match(line, /Recreation Wing/);
  assert.equal(/Garage Suite.*Recreation Wing.*Main Lodge may/.test(line), false);
});

test('all three parts say the guest has every part', () => {
  const stay = partStayFrom(['garage-suite', 'recreation-wing', 'main-lodge']);
  const line = partStayLine(stay) ?? '';
  assert.match(line, /every part of the house/);
  assert.equal(/other guests/.test(line), false, 'a full-house part booking warned about other guests');
});

test('the capacity line says the real number and contrasts it with the house', () => {
  const stay = partStayFrom(['recreation-wing']);
  assert.equal(partStayCapacityLine(stay), 'Recreation Wing sleeps 8, not the whole house\'s 24.');
});

test('an unknown part name is dropped, which leaves the whole house rather than a phantom part', () => {
  const stay = partStayFrom(['attic']);
  assert.equal(stay.wholeHouse, true, 'an unknown part produced a part stay');
  // The safe reading: an unknown value must never narrow a guest's stay.
  assert.equal(partGuestHasWholeHouse(stay), true);
});

test('the copy never names another guest or hints at who they are', () => {
  for (const units of [['garage-suite'], ['main-lodge', 'recreation-wing']]) {
    const line = partStayLine(partStayFrom(units)) ?? '';
    // No names, no counts of people, no arrival or departure times of anyone else.
    assert.equal(/guest [A-Z]/.test(line), false, 'a guest name leaked into the line');
    assert.equal(/\b\d+ (other )?guests\b/i.test(line), false, 'the line counted other people');
    assert.equal(/\b(their|his|her) (arrival|checkout)\b/i.test(line), false, 'the line described another stay');
  }
});

test('a part guest is not told they have the whole house', () => {
  assert.equal(partGuestHasWholeHouse(partStayFrom(['garage-suite'])), false);
  assert.equal(partGuestHasWholeHouse(partStayFrom(['garage-suite', 'main-lodge'])), false);
  // Three parts is still a part booking, but they do have every part.
  assert.equal(partGuestHasWholeHouse(partStayFrom(['garage-suite', 'recreation-wing', 'main-lodge'])), false);
});

test('the label names the parts without the River prefix repeating', () => {
  assert.equal(partStayLabel(partStayFrom(['garage-suite'])), 'Garage Suite');
  assert.equal(partStayLabel(partStayFrom(['garage-suite', 'main-lodge'])), 'Garage Suite and Main Lodge');
});

test('three parts read as a list, not as three "and"s', () => {
  const line = partStayLine(partStayFrom(['garage-suite', 'recreation-wing', 'main-lodge'])) ?? '';
  assert.match(line, /Garage Suite, Recreation Wing, and Main Lodge/);
  assert.equal(/and Recreation Wing and Main Lodge/.test(line), false);
});
