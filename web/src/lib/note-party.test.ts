import assert from 'node:assert/strict';
import test from 'node:test';
import { childBrief, hostPartyPhrase, noteChildCount, noteGuestCount, partyBrief } from './note-party.ts';

test('a booking note yields a guest count and leaves the name out', () => {
  assert.equal(noteGuestCount('HA-PGD5TF · 9 guests · Ada Lovelace · 801-555-0100'), 9);
  assert.equal(noteGuestCount('HMB9PP5E8F · 16 adults · River VIP'), 16);
  assert.equal(noteGuestCount('18 adults · 2 children'), 20);
  assert.equal(noteGuestCount('Ada Lovelace'), null);
  assert.equal(noteGuestCount('99 guests'), null);
  assert.equal(noteGuestCount(undefined), null);
  assert.equal(hostPartyPhrase('Ada Lovelace · 9 guests'), 'This stay is for 9 guests.');
  assert.equal(hostPartyPhrase('Ada Lovelace').includes('Ada'), false);
  assert.equal(hostPartyPhrase(undefined), 'This stay does not say how many guests.');
  assert.equal(noteChildCount('18 adults · 2 children'), 2);
  assert.equal(noteChildCount('1 adult · 1 child'), 1);
  assert.equal(noteChildCount('Ada Lovelace · 9 guests'), null);
  assert.equal(noteChildCount('9 guests · 2 children'), 2);
  assert.equal(noteChildCount('4 guests · 8 children'), null);
  assert.equal(hostPartyPhrase('9 guests · 2 children'), 'This stay is for 9 guests, including 2 children.');
  assert.equal(hostPartyPhrase('4 guests · 4 children'), 'This stay names only children. A stay needs an adult.');
  assert.equal(hostPartyPhrase('4 guests · 8 children'), 'This stay is for 4 guests.');
  assert.equal(hostPartyPhrase('Ada Lovelace · 18 adults · 2 children'), 'This stay is for 20 guests, including 2 children.');
  assert.equal(hostPartyPhrase('Ada Lovelace · 18 adults · 2 children').includes('Ada'), false);
  assert.match(childBrief(
    [
      { propertyId: 'ranch', checkIn: '2026-11-04', note: 'Ada Lovelace · 18 adults · 2 children' },
      { propertyId: 'lindon', checkIn: '2026-11-01', note: '9 guests' },
    ],
    '2026-11-01',
  ), /1 stay names children: Ranch Nov 4, 2 children/);
  assert.equal(childBrief([{ propertyId: 'ranch', checkIn: '2026-11-04', note: 'Ada Lovelace · 9 guests' }], '2026-11-01').includes('Ada'), false);
  const brief = partyBrief(
    [
      { propertyId: 'ranch', checkIn: '2026-11-04', note: 'Ada Lovelace · 9 guests · 801-555-0100' },
      { propertyId: 'lindon', checkIn: '2026-11-01' },
      { propertyId: 'river', checkIn: '2026-11-02', status: 'cancelled', note: '4 guests' },
      { propertyId: 'ranch', checkIn: '2026-10-28', note: '2 guests' },
    ],
    '2026-11-01',
  );
  assert.match(brief, /1 stay names a party size\. 1 does not: Lindon Nov 1/);
  assert.equal(brief.includes('Ada'), false);
  assert.equal(brief.includes('801'), false);
  assert.equal(brief.includes('Guest'), false);
});
