import assert from 'node:assert/strict';
import test from 'node:test';
import { getAllReservations } from './reservations-store.ts';

/*
 * Production held `res-1790218847843-tei46q` with `checkIn`/`checkOut` of the **literal string
 * `"undefined"`**, no house, payout 0, and `status: confirmed`.
 *
 * The filter in `getAllReservations` was `typeof r.checkIn === 'string'`, and `"undefined"` is a string,
 * so the row survived. The dashboard therefore reported **87 bookings when 86 were real**, and
 * `stayNights("undefined", …)` returns NaN, so anything doing arithmetic on it would poison a total.
 *
 * It never reached a P&L because every property report filters by house first and this row had none — but
 * a count that includes a booking no calendar can display is still wrong. Nothing is deleted: the row stays
 * in the store and simply stops being counted.
 */

/*
 * The seed ledger always loads alongside these fixtures, so every assertion is scoped to the ids this file
 * creates. The first version compared the whole list to one id and failed on the sixty-odd real seed stays,
 * which says nothing about the filter.
 */
function ours<T extends { id: string }>(list: T[]): string[] {
  return list.map((row) => row.id).filter((id) => id.startsWith('t-'));
}

function kvWith(custom: unknown[]) {
  return {
    SETTINGS: {
      async get(key: string) {
        if (key === 'reservations') return JSON.stringify(custom);
        return null;
      },
      async put() {},
    },
  } as never;
}

const GOOD = {
  id: 't-keep-1',
  propertyId: 'ranch',
  guestName: 'Real Guest',
  checkIn: '2027-04-01',
  checkOut: '2027-04-04',
  payout: 900,
  source: 'Airbnb',
  status: 'confirmed',
};

test('the literal string "undefined" is not a stay', async () => {
  const list = await getAllReservations(
    kvWith([
      GOOD,
      {
        id: 't-bad-1',
        guestName: 'Guest',
        checkIn: 'undefined',
        checkOut: 'undefined',
        payout: 0,
        source: 'Direct',
        status: 'confirmed',
      },
    ]),
  );
  const ids = ours(list);
  assert.ok(ids.includes('t-keep-1'), 'a real stay was dropped');
  assert.equal(ids.includes('t-bad-1'), false, 'the "undefined" row is still counted as a booking');
});

test('a stay needs a house, real dates, and a checkout after its check-in', async () => {
  const list = await getAllReservations(
    kvWith([
      GOOD,
      { ...GOOD, id: 't-no-house', propertyId: undefined },
      { ...GOOD, id: 't-bad-shape', checkIn: '2027-02-3' },
      { ...GOOD, id: 't-backwards', checkIn: '2027-05-04', checkOut: '2027-05-01' },
      { ...GOOD, id: 't-empty', checkIn: '', checkOut: '' },
    ]),
  );
  assert.deepEqual(ours(list), ['t-keep-1'], `an unusable stay survived: ${ours(list).join(', ')}`);
});

test('a two-house party still keeps both of its real stays', async () => {
  const list = await getAllReservations(
    kvWith([
      { ...GOOD, id: 't-river-half', propertyId: 'river', checkIn: '2027-06-01', checkOut: '2027-06-05' },
      { ...GOOD, id: 't-ranch-half', propertyId: 'ranch', checkIn: '2027-06-01', checkOut: '2027-06-05' },
    ]),
  );
  assert.deepEqual(ours(list).sort(), ['t-ranch-half', 't-river-half'], 'a legitimate two-house booking lost a house');
});
