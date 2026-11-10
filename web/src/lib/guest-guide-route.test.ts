/**
 * The guest guide read. A public caller used to get the Wi-Fi password and the door code from an
 * unauthenticated route. These tests pin that shut.
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

const PASSWORD = 'test-password';
const cookie = `wpm_auth=${btoa(`wpm:${PASSWORD}`).replace(/=+$/, '')}`;

const GUIDES = {
  river: {
    enabled: true,
    doorCode: '4821',
    wifiName: 'Riverhouse',
    wifiPassword: 'secret-wifi-123',
    doorNotes: 'Lockbox on the left post.',
    headline: 'Sleeps 22 on the Provo River',
    parking: 'Park in the driveway.',
  },
};

async function route() {
  return (await import('../../functions/api/guest-guide.ts')) as unknown as RouteHandler & Record<string, RouteHandler>;
}

test('a public read never returns a door code or a Wi-Fi password', async () => {
  const store: Store = new Map([['guestGuides', JSON.stringify(GUIDES)]]);
  const env = { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD };
  const api = await route();
  const res = await api.onRequestGet!({
    request: new Request('https://wilhite-portfolio.pages.dev/api/guest-guide'),
    env,
    params: {},
  });
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.equal(text.includes('secret-wifi-123'), false);
  assert.equal(text.includes('4821'), false);
  assert.equal(text.includes('Lockbox'), false);
  const body = JSON.parse(text) as {
    signedIn: boolean;
    guides: Record<string, { doorCode: string; wifiPassword: string; headline: string }>;
  };
  assert.equal(body.signedIn, false);
  assert.equal(body.guides.river.doorCode, '');
  assert.equal(body.guides.river.wifiPassword, '');
  // The published facts a guest page needs are still there.
  assert.match(body.guides.river.headline, /Provo River/);
});

test('a signed-in host still reads the whole guide to edit it', async () => {
  const store: Store = new Map([['guestGuides', JSON.stringify(GUIDES)]]);
  const env = { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD };
  const api = await route();
  const res = await api.onRequestGet!({
    request: new Request('https://wilhite-portfolio.pages.dev/api/guest-guide', { headers: { Cookie: cookie } }),
    env,
    params: {},
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    guides: Record<string, { doorCode: string; wifiPassword: string }>;
  };
  assert.equal(body.guides.river.doorCode, '4821');
  assert.equal(body.guides.river.wifiPassword, 'secret-wifi-123');
});

test('saving a guide needs the host, and a public save writes nothing', async () => {
  const store: Store = new Map([['guestGuides', JSON.stringify(GUIDES)]]);
  const env = { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD };
  const api = await route();
  const before = store.get('guestGuides');
  const res = await api.onRequestPost!({
    request: new Request('https://wilhite-portfolio.pages.dev/api/guest-guide', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ propertyId: 'river', guide: { enabled: false } }),
    }),
    env,
    params: {},
  });
  assert.equal(res.status, 401);
  assert.equal(store.get('guestGuides'), before);
});

test('a signed-in host can still turn a house app off and on', async () => {
  const store: Store = new Map([['guestGuides', JSON.stringify(GUIDES)]]);
  const env = { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD };
  const api = await route();
  const off = await api.onRequestPost!({
    request: new Request('https://wilhite-portfolio.pages.dev/api/guest-guide', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ propertyId: 'river', guide: { enabled: false } }),
    }),
    env,
    params: {},
  });
  assert.equal(off.status, 200);
  const body = (await off.json()) as { guide: { enabled: boolean } };
  assert.equal(body.guide.enabled, false);
});
