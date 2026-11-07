/**
 * The guest total was recorded but unreachable.
 *
 * `accept` wrote it and the tests passed, but nothing read it back: the client `Reservation` type had
 * no such field, no route returned it to a screen, and the guests page showed a bare `$4,200` that a
 * host could not tell was the guest price or their own cut. A stored field nobody can see is the same
 * defect as not storing it — and it is the shape that has recurred on this branch, so these tests
 * walk the whole path rather than the one function.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { onRequestGet, onRequestPost } from '../../functions/api/reservations/index.ts';

const PASSWORD = 'test-password';
const cookie = `wpm_auth=${btoa(`wpm:${PASSWORD}`).replace(/=+$/, '')}`;

function envWith(store: Map<string, string>) {
  return {
    SETTINGS: {
      get: async (key: string) => store.get(key) ?? null,
      put: async (key: string, value: string) => {
        store.set(key, value);
      },
    },
    DASHBOARD_PASSWORD: PASSWORD,
  } as never;
}

async function get(store: Map<string, string>) {
  const res = await onRequestGet!({
    request: new Request('https://x/api/reservations', { headers: { Cookie: cookie } }),
    env: envWith(store),
    params: {},
  } as never);
  return (await res.json()) as {
    reservations: Array<{ id: string; checkIn: string; payout: number; guestTotal?: number }>;
  };
}

test('a recorded guest total reaches the client that draws the stay', async () => {
  const store = new Map<string, string>();
  store.set(
    'reservations',
    JSON.stringify([
      {
        id: 'res-1',
        guestName: 'Ada',
        propertyId: 'river',
        checkIn: '2027-12-01',
        checkOut: '2027-12-04',
        payout: 4200,
        guestTotal: 6550,
        source: 'Direct',
        status: 'confirmed',
      },
    ]),
  );
  const body = await get(store);
  const row = body.reservations.find((r) => r.id === 'res-1');
  assert.ok(row, 'the stay was not returned');
  assert.equal(row.guestTotal, 6550, 'the guest total did not survive the route');
  assert.equal(row.payout, 4200, 'the payout changed');
});

test('a stay created through the API keeps the guest total it was given', async () => {
  const store = new Map<string, string>();
  const res = await onRequestPost!({
    request: new Request('https://x/api/reservations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        guestName: 'Ada',
        propertyId: 'river',
        checkIn: '2027-12-01',
        checkOut: '2027-12-04',
        payout: 4200,
        guestTotal: 6550,
      }),
    }),
    env: envWith(store),
    params: {},
  } as never);
  assert.ok(res.status === 200 || res.status === 201, `create returned ${res.status}`);
  const body = await get(store);
  /*
   * Find the row by its dates, not by position: the list is sorted by check-in across the seed stays
   * too, so `[0]` is whichever stay starts earliest and not the one just created.
   */
  const row = body.reservations.find((r) => r.checkIn === '2027-12-01' && r.payout === 4200);
  assert.ok(row, 'the created stay was not returned');
  assert.equal(row.guestTotal, 6550, 'the create route dropped the guest total');
});

test('a create with no guest total records none rather than zero', async () => {
  /*
   * Zero would read as a comped stay and print "Guest $0.00" on a real booking. Absent is the honest
   * answer for a channel booking imported from an iCal feed, which never carries a price.
   */
  const store = new Map<string, string>();
  await onRequestPost!({
    request: new Request('https://x/api/reservations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        guestName: 'Ada',
        propertyId: 'ranch',
        checkIn: '2027-12-01',
        checkOut: '2027-12-02',
        payout: 900,
      }),
    }),
    env: envWith(store),
    params: {},
  } as never);
  const row = (await get(store)).reservations.find((r) => r.checkIn === '2027-12-01' && r.payout === 900);
  assert.ok(row, 'the created stay was not returned');
  assert.equal('guestTotal' in row, false, 'a guest total was invented for a stay that had none');
});

test('the guests page names both figures, so a lone number cannot be misread', () => {
  /*
   * The row showed `formatCurrency(stay.payout)` with no label at all. A host could not tell whether
   * that figure was what the guest paid or what they kept, which is precisely why the guest total has
   * to be shown beside it.
   */
  const page = readFileSync(join(process.cwd(), 'src', 'components', 'GuestsPanel.tsx'), 'utf8');
  assert.match(page, /stay-guest-total/, 'the guests page does not show the guest total');
  assert.match(page, /Guest \{formatCurrency\(stay\.guestTotal\)\}/, 'the guest figure is not labelled');
  assert.match(page, /Keep \{formatCurrency\(stay\.payout\)\}/, 'the payout is not labelled');
  // And a stay with no recorded total still says what its single figure is.
  assert.match(page, /host net/, 'a stay without a guest total shows an unlabelled figure');
});

test('the client type declares the field it receives', () => {
  // Without this, the data crosses the wire and the screen cannot legally read it.
  const api = readFileSync(join(process.cwd(), 'src', 'lib', 'api.ts'), 'utf8');
  const start = api.indexOf('export interface Reservation {');
  assert.ok(start > 0, 'the Reservation interface moved');
  const body = api.slice(start, api.indexOf('}', start));
  assert.match(body, /guestTotal\?: number;/, 'the client Reservation type has no guest total');
});
