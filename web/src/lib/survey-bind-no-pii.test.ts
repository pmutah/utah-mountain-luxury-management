/**
 * The confirmation-code fallback does not carry guest contacts.
 *
 * `KNOWN_CONFIRMATION_STAYS` let a Hospitable confirmation code resolve a stay the seed did not have. It also
 * held the guest's phone number as a literal — in a **public** repository.
 *
 * The number bought nothing. The stay is booked in production, so the phone is already on the reservation row
 * in the store, which is where a contact belongs. The fallback now reads the stored phone and never invents
 * one, so resolving a code still works and no guest number lives in source.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { KNOWN_CONFIRMATION_STAYS, resolveStayForSurvey } from '../../functions/_lib/survey-bind.ts';

const SOURCE = fs.readFileSync('functions/_lib/survey-bind.ts', 'utf8');

function fakeKv(store: Map<string, string>) {
  return {
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
  };
}

test('the known-stay list carries no phone number', () => {
  assert.equal(
    /guestPhone/.test(SOURCE.split('export function')[0] ?? ''),
    false,
    'a guest phone number is hardcoded in the known-stay list',
  );
  for (const stay of KNOWN_CONFIRMATION_STAYS) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(stay, 'guestPhone'),
      false,
      `${stay.confirmationCode} still carries a guestPhone`,
    );
  }
});

test('a stored stay keeps the phone the host wrote on it', async () => {
  /*
   * The behaviour that must survive: a host who wrote the number on the booking keeps it. Only the hardcoded
   * copy is gone, not the stored one.
   *
   * The fixture uses a stay the seed does not already know, because a stored row that collides with a seed row
   * is deduplicated away by `getAllReservations` — my first version of this test did that and failed for a
   * reason that had nothing to do with the code.
   */
  const store = new Map<string, string>();
  store.set(
    'reservations',
    JSON.stringify([
      {
        id: 'res-host-phone',
        guestName: 'Ada Lovelace',
        propertyId: 'ranch',
        checkIn: '2027-05-01',
        checkOut: '2027-05-04',
        payout: 900,
        source: 'direct',
        guestPhone: '+18015551234',
      },
    ]),
  );
  const env = { SETTINGS: fakeKv(store) };

  const stay = await resolveStayForSurvey(env as never, { reservationId: 'res-host-phone' });
  assert.ok(stay, 'the stored stay was not resolved by id');
  assert.equal(stay!.guestPhone, '+18015551234', 'the stored phone was dropped or replaced');
});

test('a stay created from the fallback has no invented phone number', async () => {
  /*
   * Before, a code with no matching stay created one carrying a hardcoded number. That was the leak: a name,
   * dates, and a phone number in source. The stay is still created, so the code still resolves — it just
   * carries no contact detail this file cannot legitimately know.
   */
  const store = new Map<string, string>();
  store.set('reservations', JSON.stringify([]));
  const env = { SETTINGS: fakeKv(store) };

  const stay = await resolveStayForSurvey(env as never, { confirmationCode: 'HMB9PP5E8F' });
  assert.ok(stay, 'the code no longer resolves to a stay');
  assert.equal(stay!.confirmationCode, 'HMB9PP5E8F');
  assert.equal(stay!.guestPhone, undefined, 'a phone number was invented for the new stay');

  const saved = JSON.parse(store.get('reservations') ?? '[]') as Array<{ guestPhone?: string }>;
  assert.equal(saved[0]?.guestPhone, undefined, 'a phone number was written into the store');
});
