/**
 * The Co-host agent could save a confirmed stay with **no clash check**, so it could double-book a
 * house that the human accept path refuses. An AI teammate is not less dangerous than a person here:
 * a double-booked night is a double-booked night.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { executeAgentTool } from '../../functions/_lib/agent/execute-tool.ts';

type Store = Map<string, string>;

function fakeKv(store: Store) {
  return {
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
  };
}

const EXISTING = {
  id: 'res-existing',
  guestName: 'Existing Guest',
  propertyId: 'river',
  checkIn: '2026-12-15',
  checkOut: '2026-12-18',
  payout: 5000,
  source: 'Airbnb',
  status: 'confirmed',
};

function seeded(rows: unknown[] = [EXISTING], blocks: unknown[] = []): Store {
  const store: Store = new Map();
  store.set('reservations', JSON.stringify(rows));
  if (blocks.length > 0) store.set('calendarBlocks', JSON.stringify(blocks));
  return store;
}

function envFor(store: Store) {
  return { SETTINGS: fakeKv(store) } as never;
}

function create(store: Store, args: Record<string, unknown>) {
  return executeAgentTool(envFor(store), 'manage_reservations', { action: 'create', ...args });
}

function savedRiver(store: Store): Array<{ checkIn: string; checkOut: string }> {
  const rows = JSON.parse(store.get('reservations') ?? '[]') as Array<{ propertyId: string; checkIn: string; checkOut: string }>;
  return rows.filter((row) => row.propertyId === 'river');
}

test('the agent cannot double-book a house the calendar already holds', async () => {
  const store = seeded();
  const out = await create(store, {
    guestName: 'Agent Overlap',
    propertyId: 'river',
    checkIn: '2026-12-16',
    checkOut: '2026-12-19',
    payout: 4000,
  });
  assert.equal(out.result.refused, true, 'the agent saved an overlapping stay');
  assert.match(String(out.result.error), /already on the calendar/);
  assert.equal(savedRiver(store).length, 1, 'the refused create still wrote a stay');
  assert.deepEqual(out.result.nights, ['2026-12-16', '2026-12-17']);
});

test('a stay that merely checks out on the arrival day is allowed', async () => {
  // The existing stay ends on the 18th, so a new stay starting the 18th does not overlap it.
  const store = seeded();
  const out = await create(store, {
    guestName: 'Back to back',
    propertyId: 'river',
    checkIn: '2026-12-18',
    checkOut: '2026-12-20',
    payout: 3000,
  });
  assert.equal(out.result.refused, undefined, 'a back-to-back stay was refused as a clash');
  assert.equal(savedRiver(store).length, 2);
});

test('a different house is not blocked by a stay at another house', async () => {
  /*
   * The seeded calendar has a real Ranch stay on Dec 18-21, so a Ranch request across those nights
   * clashes for a genuine reason. This uses a Lindon range the seed leaves empty, which keeps the
   * test about house separation and not about the seed data.
   */
  const store = seeded();
  const out = await create(store, {
    guestName: 'Lindon guest',
    propertyId: 'lindon',
    checkIn: '2027-03-02',
    checkOut: '2027-03-05',
    payout: 900,
  });
  assert.equal(out.result.refused, undefined, 'a stay at another house was refused');
  const saved = JSON.parse(store.get('reservations') ?? '[]') as Array<{ propertyId: string }>;
  assert.equal(saved.filter((row) => row.propertyId === 'lindon').length, 1);
});

test('a cancelled stay does not block the nights it gave up', async () => {
  const store = seeded([{ ...EXISTING, status: 'cancelled' }]);
  const out = await create(store, {
    guestName: 'Took the freed nights',
    propertyId: 'river',
    checkIn: '2026-12-16',
    checkOut: '2026-12-19',
    payout: 4000,
  });
  assert.equal(out.result.refused, undefined, 'a cancelled stay still blocked its nights');
});

test('a calendar block blocks the agent the same way it blocks a person', async () => {
  // A range the seed leaves empty, so the block is the only thing that can refuse this.
  const store = seeded([], [
    { id: 'blk-1', propertyId: 'ranch', start: '2027-04-10', end: '2027-04-14', note: 'work' },
  ]);
  const out = await create(store, {
    guestName: 'Over a block',
    propertyId: 'ranch',
    checkIn: '2027-04-12',
    checkOut: '2027-04-16',
    payout: 1000,
  });
  assert.equal(out.result.refused, true, 'the agent booked over a calendar block');
  assert.match(String(out.result.error), /already on the calendar/);
});

test('an empty calendar still lets the agent book', async () => {
  const store = seeded([]);
  const out = await create(store, {
    guestName: 'First guest',
    propertyId: 'river',
    checkIn: '2027-02-01',
    checkOut: '2027-02-04',
    payout: 5000,
  });
  assert.equal(out.result.ok, true);
  assert.equal(savedRiver(store).length, 1);
});
