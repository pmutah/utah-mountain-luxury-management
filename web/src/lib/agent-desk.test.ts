/**
 * The Co-host can create a stay directly, but could not see or answer a saved direct request — the
 * job a person actually does at the desk. These tests pin that the agent can now do it, and that it
 * cannot do anything a host could not: no booking at zero, no double-book, no invented decline reason.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { executeAgentTool } from '../../functions/_lib/agent/execute-tool.ts';
import { suggestedPayouts } from './payout-suggest.ts';

type Store = Map<string, string>;

const REQUEST = {
  id: 'book-1',
  name: 'Guest',
  email: 'g@example.com',
  propertyId: 'river',
  checkIn: '2027-05-01',
  checkOut: '2027-05-04',
  guests: 8,
  createdAt: '2026-11-06T09:00:00.000Z',
};

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

function seeded(reservations: unknown[] = []): Store {
  const store: Store = new Map();
  store.set('booking-requests', JSON.stringify([REQUEST]));
  store.set('reservations', JSON.stringify(reservations));
  store.set('calendarBlocks', JSON.stringify([]));
  store.set('bookingHolds', JSON.stringify([]));
  store.set('bookingDeclines', JSON.stringify([]));
  store.set('customExpenses', JSON.stringify([]));
  return store;
}

/** A deployment with a password, which is what the desk routes need to accept an agent call. */
function envFor(store: Store) {
  return { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: 'pw' } as never;
}

const deskPayout = () =>
  suggestedPayouts({ propertyId: 'river', checkIn: REQUEST.checkIn, checkOut: REQUEST.checkOut, guests: 8 }).reduce(
    (sum, row) => sum + row.hostNet,
    0,
  );

function stays(store: Store): unknown[] {
  return JSON.parse(store.get('reservations') ?? '[]') as unknown[];
}

test('the agent can list a request with the payout the desk would show', async () => {
  const store = seeded();
  const out = await executeAgentTool(envFor(store), 'manage_operations', { action: 'list_requests' });
  const rows = out.result.requests as Array<{ id: string; payout: number | null; payoutLine: string }>;
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.id, 'book-1');
  assert.equal(rows[0]!.payout, deskPayout(), 'the agent was shown a different payout than the desk');
  assert.match(rows[0]!.payoutLine, /guest was quoted/);
});

test('the agent can accept a request at the payout the desk showed', async () => {
  const store = seeded();
  const out = await executeAgentTool(envFor(store), 'manage_operations', {
    action: 'accept_request',
    requestId: 'book-1',
    payout: deskPayout(),
    confirm: true,
  });
  assert.equal(out.result.ok, true, JSON.stringify(out.result));
  const saved = stays(store) as Array<{ propertyId: string; payout: number }>;
  assert.equal(saved.length, 1);
  assert.equal(saved[0]!.propertyId, 'river');
  assert.equal(saved[0]!.payout, deskPayout());
});

test('the agent must confirm before a booking is written and a guest is emailed', async () => {
  /*
   * Accepting writes a booking AND emails the guest a confirmation, and that email cannot be taken
   * back. The first call has to say what would happen and do nothing.
   */
  const store = seeded();
  const dry = await executeAgentTool(envFor(store), 'manage_operations', {
    action: 'accept_request',
    requestId: 'book-1',
    payout: deskPayout(),
  });
  assert.equal(dry.result.pendingApproval, true, 'the agent booked without confirming');
  assert.match(String(dry.result.message), /emails the guest/);
  assert.match(String(dry.result.message), /Nothing has been done yet/);
  assert.equal(stays(store).length, 0, 'a stay was written before the agent confirmed');

  // The second call, with confirm, does the work.
  const real = await executeAgentTool(envFor(store), 'manage_operations', {
    action: 'accept_request',
    requestId: 'book-1',
    payout: deskPayout(),
    confirm: true,
  });
  assert.equal(real.result.ok, true);
  assert.equal(stays(store).length, 1);
});

test('confirm has to be exactly true, not just present', async () => {
  const store = seeded();
  for (const value of ['true', 1, 'yes', null]) {
    const out = await executeAgentTool(envFor(store), 'manage_operations', {
      action: 'accept_request',
      requestId: 'book-1',
      payout: deskPayout(),
      confirm: value,
    });
    assert.equal(out.result.pendingApproval, true, `confirm: ${JSON.stringify(value)} was treated as a yes`);
  }
  assert.equal(stays(store).length, 0);
});

test('the agent cannot accept without a payout, so nothing is booked for nothing', async () => {
  const store = seeded();
  const out = await executeAgentTool(envFor(store), 'manage_operations', {
    action: 'accept_request',
    requestId: 'book-1',
  });
  assert.equal(out.result.refused, true);
  assert.match(String(out.result.error), /payout above zero is required/);
  assert.match(String(out.result.error), /Nothing was booked/);
  assert.equal(stays(store).length, 0, 'a booking was written without a payout');
});

test('a zero payout is refused the same way', async () => {
  const store = seeded();
  const out = await executeAgentTool(envFor(store), 'manage_operations', {
    action: 'accept_request',
    requestId: 'book-1',
    payout: 0,
  });
  assert.equal(out.result.refused, true);
  assert.equal(stays(store).length, 0);
});

test('the desk clash rule applies to the agent too', async () => {
  const store = seeded([
    {
      id: 'res-x',
      guestName: 'Other',
      propertyId: 'river',
      checkIn: '2027-05-02',
      checkOut: '2027-05-06',
      payout: 5000,
      source: 'Airbnb',
      status: 'confirmed',
    },
  ]);
  const out = await executeAgentTool(envFor(store), 'manage_operations', {
    action: 'accept_request',
    requestId: 'book-1',
    payout: deskPayout(),
    confirm: true,
  });
  assert.equal(out.result.refused, true);
  assert.match(String(out.result.error), /already on the calendar/);
  assert.equal(stays(store).length, 1, 'the agent double-booked a night the desk would refuse');
});

test('the agent cannot accept the same request twice', async () => {
  const store = seeded();
  const once = await executeAgentTool(envFor(store), 'manage_operations', {
    action: 'accept_request',
    requestId: 'book-1',
    payout: deskPayout(),
    confirm: true,
  });
  assert.equal(once.result.ok, true);
  const twice = await executeAgentTool(envFor(store), 'manage_operations', {
    action: 'accept_request',
    requestId: 'book-1',
    payout: deskPayout(),
    confirm: true,
  });
  assert.equal(twice.result.refused, true);
  assert.equal(stays(store).length, 1, 'a second accept saved a second stay');
});

test('the agent can decline with one of the real reasons, and only those', async () => {
  const store = seeded();
  const bad = await executeAgentTool(envFor(store), 'manage_operations', {
    action: 'decline_request',
    requestId: 'book-1',
    reason: 'because I said so',
  });
  assert.equal(bad.result.refused, true);
  assert.match(String(bad.result.error), /Name a reason/);
  assert.equal((JSON.parse(store.get('bookingDeclines') ?? '[]') as unknown[]).length, 0);

  const good = await executeAgentTool(envFor(store), 'manage_operations', {
    action: 'decline_request',
    requestId: 'book-1',
    reason: 'dates-taken',
    confirm: true,
  });
  assert.equal(good.result.ok, true);
  assert.match(String(good.result.line), /Declined/);
  assert.equal((JSON.parse(store.get('bookingDeclines') ?? '[]') as unknown[]).length, 1);
});

test('the agent must confirm before a decline emails the guest and frees the nights', async () => {
  const store = seeded();
  const dry = await executeAgentTool(envFor(store), 'manage_operations', {
    action: 'decline_request',
    requestId: 'book-1',
    reason: 'dates-taken',
  });
  assert.equal(dry.result.pendingApproval, true, 'the agent declined without confirming');
  assert.match(String(dry.result.message), /emails the guest/);
  assert.match(String(dry.result.message), /another guest can take those nights/);
  assert.equal((JSON.parse(store.get('bookingDeclines') ?? '[]') as unknown[]).length, 0, 'a decline was saved before confirming');
});

test('with no dashboard password the agent cannot book, and is told why', async () => {
  // The desk route fails closed, so the agent inherits that. It must not look like it worked.
  // The agent confirms first, because that is what a real call does; the refusal happens after.
  const store = seeded();
  const out = await executeAgentTool(
    { SETTINGS: fakeKv(store) } as never,
    'manage_operations',
    { action: 'accept_request', requestId: 'book-1', payout: deskPayout(), confirm: true },
  );
  assert.equal(out.result.refused, true);
  assert.equal(out.result.status, 401);
  assert.match(String(out.result.error), /no dashboard password/i);
  assert.equal(stays(store).length, 0);
});
