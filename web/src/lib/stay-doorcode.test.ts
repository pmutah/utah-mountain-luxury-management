/**
 * The door code and Wi-Fi are the most consequential thing on the guest phone, and they are gated by
 * two things that must both be true: the stay has to be inside its access window, and the guest has to
 * have read the house rules.
 *
 * The window opens the day before check-in and closes at noon on the checkout day. Until then the
 * fields are `null` rather than absent, so a client cannot tell "hidden" from "the house has no code".
 *
 * A fixture id of `r1` collided with a real seed stay while these were being written, which made the
 * route read the seed stay's January dates instead of the fixture's. The ids here are deliberately
 * unique so that cannot happen again.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { onRequestGet } from '../../functions/api/stay-guide/[token]/index.ts';

const PASSWORD = 'test-password';
const STAY_ID = 'stay-test-doorcode-1';

const GUIDE = {
  enabled: true,
  doorCode: '4821',
  wifiPassword: 'fixture-wifi-secret-not-real',
  wifiName: 'FixtureNet',
  headline: 'Sleeps 24',
  address: 'Vivian Park',
  arrival: 'Park in the drive',
  parking: 'Drive',
  checkout: ['Trash'],
  notes: [{ title: 'Septic', body: 'Only toilet paper' }],
  nearby: [
    { name: 'a', note: 'b' },
    { name: 'c', note: 'd' },
    { name: 'e', note: 'f' },
  ],
};

async function ask(checkIn: string, ready: boolean, checkOut = '2026-12-30') {
  const stay = {
    id: STAY_ID,
    propertyId: 'river',
    checkIn,
    checkOut,
    guestName: 'Ada',
    payout: 100,
    source: 'Direct',
    status: 'confirmed',
  };
  const survey = { token: 'tok-door', reservationId: STAY_ID, propertyId: 'river', checkIn, checkOut };
  const store: Record<string, string> = {
    guestGuides: JSON.stringify({ river: GUIDE }),
    guestSurveys: JSON.stringify([survey]),
    reservations: JSON.stringify([stay]),
  };
  const env = {
    DASHBOARD_PASSWORD: PASSWORD,
    SETTINGS: {
      get: async (key: string) => store[key] ?? null,
      put: async () => {},
    },
  } as never;
  const res = await onRequestGet!({
    request: new Request(`https://x/api/stay-guide/tok-door${ready ? '?ready=1' : ''}`),
    env,
    params: { token: 'tok-door' },
  } as never);
  const body = (await res.json()) as {
    access?: { phase: string; unlocked: boolean; doorCode: string | null; wifiPassword: string | null };
  };
  return { status: res.status, access: body.access };
}

test('the code stays hidden until the day before check-in', async () => {
  const far = await ask('2026-12-01', true);
  assert.equal(far.access?.phase, 'before');
  assert.equal(far.access?.unlocked, false);
  assert.equal(far.access?.doorCode, null, 'the door code leaked before its window opened');
  assert.equal(far.access?.wifiPassword, null, 'the Wi-Fi password leaked before its window opened');
});

test('the code stays hidden inside the window until the rules are read', async () => {
  /*
   * This is the second gate, and the one a client could otherwise skip by calling the API directly:
   * being inside the window is not enough on its own.
   */
  const unread = await ask('2026-11-08', false);
  assert.equal(unread.access?.phase, 'during');
  assert.equal(unread.access?.unlocked, true);
  assert.equal(unread.access?.doorCode, null, 'the code was shown without the rules being read');
});

test('both gates true reveals the code, and only then', async () => {
  const open = await ask('2026-11-08', true);
  assert.equal(open.access?.doorCode, '4821');
  assert.equal(open.access?.wifiPassword, 'fixture-wifi-secret-not-real');
});

test('a cancelled stay answers 410 rather than a guide', async () => {
  // A cancelled stay must not keep serving a door code either.
  const stay = {
    id: STAY_ID,
    propertyId: 'river',
    checkIn: '2026-11-08',
    checkOut: '2026-11-10',
    guestName: 'Ada',
    payout: 100,
    source: 'Direct',
    status: 'cancelled',
  };
  const survey = { token: 'tok-door', reservationId: STAY_ID, propertyId: 'river', checkIn: '2026-11-08', checkOut: '2026-11-10' };
  const store: Record<string, string> = {
    guestGuides: JSON.stringify({ river: GUIDE }),
    guestSurveys: JSON.stringify([survey]),
    reservations: JSON.stringify([stay]),
  };
  const env = { SETTINGS: { get: async (key: string) => store[key] ?? null, put: async () => {} } } as never;
  const res = await onRequestGet!({
    request: new Request('https://x/api/stay-guide/tok-door?ready=1'),
    env,
    params: { token: 'tok-door' },
  } as never);
  assert.equal(res.status, 410);
  assert.equal((await res.text()).includes('4821'), false, 'a cancelled stay still served the door code');
});

test('a house with the guest app off serves no guide at all', async () => {
  const stay = { id: STAY_ID, propertyId: 'river', checkIn: '2026-11-08', checkOut: '2026-11-10', guestName: 'Ada', payout: 1, source: 'Direct', status: 'confirmed' };
  const survey = { token: 'tok-door', reservationId: STAY_ID, propertyId: 'river', checkIn: '2026-11-08', checkOut: '2026-11-10' };
  const store: Record<string, string> = {
    guestGuides: JSON.stringify({ river: { ...GUIDE, enabled: false } }),
    guestSurveys: JSON.stringify([survey]),
    reservations: JSON.stringify([stay]),
  };
  const env = { SETTINGS: { get: async (key: string) => store[key] ?? null, put: async () => {} } } as never;
  const res = await onRequestGet!({
    request: new Request('https://x/api/stay-guide/tok-door?ready=1'),
    env,
    params: { token: 'tok-door' },
  } as never);
  const body = (await res.json()) as { enabled?: boolean };
  assert.equal(body.enabled, false, 'the app is off but a guide was served');
  assert.equal((await JSON.stringify(body)).includes('4821'), false);
});
