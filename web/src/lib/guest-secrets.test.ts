/**
 * The guest-facing routes are reached with a stay token, not a login. Each one has to keep the way
 * into the house off the wire until the guest has actually unlocked their stay.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

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

type RouteHandler = (context: { request: Request; env: unknown; params: Record<string, string> }) => Promise<Response>;

const TOKEN = 'b'.repeat(32);

function seed(store: Store, over: Record<string, unknown> = {}) {
  store.set(
    'guestSurveys',
    JSON.stringify([
      {
        token: TOKEN,
        reservationId: 'res-1',
        propertyId: 'river',
        guestName: 'Ada Lovelace',
        checkIn: '2099-12-01',
        checkOut: '2099-12-04',
        createdAt: '2026-11-07T00:00:00.000Z',
        ...over,
      },
    ]),
  );
  store.set(
    'guestGuides',
    JSON.stringify({
      river: {
        enabled: true,
        doorCode: '4821',
        wifiName: 'Riverhouse',
        wifiPassword: 'fixture-wifi-secret-not-real',
        headline: 'Sleeps 25 on the Provo River',
      },
    }),
  );
}

test('a stay guide before the window shows no door code and no Wi-Fi password', async () => {
  const store: Store = new Map();
  // Check-in is far in the future, so the code must stay shut.
  seed(store);
  const env = { SETTINGS: fakeKv(store) };
  const mod = (await import('../../functions/api/stay-guide/[token]/index.ts')) as unknown as Record<string, RouteHandler>;
  const res = await mod.onRequestGet!({
    request: new Request(`https://x/api/stay-guide/${TOKEN}`),
    env,
    params: { token: TOKEN },
  });
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.equal(text.includes('fixture-wifi-secret-not-real'), false, 'the Wi-Fi password leaked before the stay');
  assert.equal(text.includes('4821'), false, 'the door code leaked before the stay');
  const body = JSON.parse(text) as { access: { doorCode: string | null; wifiPassword: string | null } };
  assert.equal(body.access.doorCode, null);
  assert.equal(body.access.wifiPassword, null);
});

test('a wrong stay token reads nothing', async () => {
  const store: Store = new Map();
  seed(store);
  const env = { SETTINGS: fakeKv(store) };
  const mod = (await import('../../functions/api/stay-guide/[token]/index.ts')) as unknown as Record<string, RouteHandler>;
  const res = await mod.onRequestGet!({
    request: new Request(`https://x/api/stay-guide/${'c'.repeat(32)}`),
    env,
    params: { token: 'c'.repeat(32) },
  });
  assert.equal(res.status, 404);
  const text = await res.text();
  assert.equal(text.includes('fixture-wifi-secret-not-real'), false);
});

test('the preferences route returns one stay and no other guest', async () => {
  const store: Store = new Map();
  seed(store);
  store.set(
    'guestSurveys',
    JSON.stringify([
      { token: TOKEN, reservationId: 'res-1', propertyId: 'river', guestName: 'Ada Lovelace', checkIn: '2099-12-01', checkOut: '2099-12-04' },
      { token: 'd'.repeat(32), reservationId: 'res-2', propertyId: 'ranch', guestName: 'Grace Hopper', checkIn: '2099-12-05', checkOut: '2099-12-07' },
    ]),
  );
  const env = { SETTINGS: fakeKv(store) };
  const mod = (await import('../../functions/api/stay-preferences/[token].ts')) as unknown as Record<string, RouteHandler>;
  const res = await mod.onRequestGet!({
    request: new Request(`https://x/api/stay-preferences/${TOKEN}`),
    env,
    params: { token: TOKEN },
  });
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.equal(text.includes('Grace Hopper'), false);
  assert.equal(text.includes('Ada Lovelace'), true);
});

test('a guest guide read for one house does not return the other houses secrets', async () => {
  const store: Store = new Map();
  store.set(
    'guestGuides',
    JSON.stringify({
      river: { enabled: true, doorCode: '1111', wifiPassword: 'river-pass' },
      ranch: { enabled: true, doorCode: '2222', wifiPassword: 'ranch-pass' },
    }),
  );
  const env = { SETTINGS: fakeKv(store) };
  const mod = (await import('../../functions/api/guest-guide.ts')) as unknown as Record<string, RouteHandler>;
  const res = await mod.onRequestGet!({
    request: new Request('https://x/api/guest-guide'),
    env,
    params: {},
  });
  const text = await res.text();
  assert.equal(text.includes('river-pass'), false);
  assert.equal(text.includes('ranch-pass'), false);
  assert.equal(text.includes('1111'), false);
  assert.equal(text.includes('2222'), false);
});
