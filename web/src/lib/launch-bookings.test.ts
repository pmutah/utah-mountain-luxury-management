import assert from 'node:assert/strict';
import test from 'node:test';
import { launchBookingsNote, riverLaunchLine } from './launch-bookings.ts';

test('the launch list does not use a stand-in when bookings cannot be read', () => {
  const note = launchBookingsNote(true);
  assert.match(note, /could not be read/);
  assert.match(note, /not using a stand-in/);
  assert.match(note, /Nothing was written over them/);
  assert.equal(launchBookingsNote(false), '');
  assert.equal(note.includes('$'), false);
  assert.equal(/\bopen\b/i.test(note), false);
  assert.equal(riverLaunchLine(1), '1 day until the first stays');
  assert.equal(riverLaunchLine(0), 'First stays are today');
  assert.equal(riverLaunchLine(-3), 'First stays have started');
  assert.equal(/\bis open\b/i.test(riverLaunchLine(-3)), false);
});
