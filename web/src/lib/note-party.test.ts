import assert from 'node:assert/strict';
import test from 'node:test';
import { noteGuestCount } from './note-party.ts';

test('a booking note yields a guest count and leaves the name out', () => {
  assert.equal(noteGuestCount('HA-PGD5TF · 9 guests · Ada Lovelace · 801-555-0100'), 9);
  assert.equal(noteGuestCount('HMB9PP5E8F · 16 adults · River VIP'), 16);
  assert.equal(noteGuestCount('18 adults · 2 children'), 20);
  assert.equal(noteGuestCount('Ada Lovelace'), null);
  assert.equal(noteGuestCount('99 guests'), null);
  assert.equal(noteGuestCount(undefined), null);
});
