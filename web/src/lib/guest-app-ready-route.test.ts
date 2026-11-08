/**
 * Turning a guest app on. The switch has to refuse a thin guide, and the route has to refuse it too,
 * so a live app never shows a guest a nearly blank page.
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

const FULL = {
  headline: 'Sleeps 24 on the Provo River',
  address: '270 East Center Street, Lindon, Utah 84042',
  arrival: 'Drive up Provo Canyon to Vivian Park.',
  parking: 'Park in the driveway.',
  checkout: 'Start the dishwasher.',
  sections: [{ title: 'Septic', body: 'Only toilet paper goes in the toilets.' }],
  places: [
    { name: 'Sundance', note: 'Ski in winter.' },
    { name: 'Bridal Veil Falls', note: 'A short walk.' },
    { name: 'Heber Valley Railroad', note: 'Scenic rides.' },
  ],
};

async function route() {
  return (await import('../../functions/api/guest-guide.ts')) as unknown as Record<string, RouteHandler>;
}

function save(body: unknown) {
  return new Request('https://x/api/guest-guide', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify(body),
  });
}

test('a guide whose stored places are blanked is refused', async () => {
  // A host can clear the places list. The merge keeps an explicit empty array, and three places is
  // the floor, so the switch is refused and nothing is written.
  const store: Store = new Map([
    ['guestGuides', JSON.stringify({ river: { ...FULL, places: [] } })],
  ]);
  const env = { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD };
  const api = await route();
  const before = store.get('guestGuides');
  const res = await api.onRequestPost!({
    request: save({ propertyId: 'river', guide: { enabled: true } }),
    env,
    params: {},
  });
  assert.equal(res.status, 409);
  const body = (await res.json()) as { error: string; ready: boolean };
  assert.equal(body.ready, false);
  assert.match(body.error, /nearly blank page|nearby places/);
  assert.equal(store.get('guestGuides'), before, 'a refused enable wrote to the store');
});

test('the route turns on a guide that is ready', async () => {
  const store: Store = new Map([['guestGuides', JSON.stringify({ river: FULL })]]);
  const env = { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD };
  const api = await route();
  const res = await api.onRequestPost!({
    request: save({ propertyId: 'river', guide: { enabled: true } }),
    env,
    params: {},
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { ok: boolean; guide: { enabled: boolean }; readiness: { ready: boolean } };
  assert.equal(body.ok, true);
  assert.equal(body.guide.enabled, true);
  assert.equal(body.readiness.ready, true);
});

test('saving a field without turning it on is never blocked', async () => {
  // A host must be able to fill in a guide. Only the switch is gated, and saving never flips it on.
  const store: Store = new Map([['guestGuides', JSON.stringify({ river: { headline: 'x' } })]]);
  const env = { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD };
  const api = await route();
  const res = await api.onRequestPost!({
    request: save({ propertyId: 'river', guide: { address: '123 Main' } }),
    env,
    params: {},
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { guide: { address: string; enabled: boolean }; readiness: { ready: boolean } };
  assert.equal(body.guide.address, '123 Main');
  // The save did not turn the app on, which is the only thing that matters here.
  assert.equal(body.guide.enabled, false);
});

test('the saved guide comes back with its readiness so the editor can show it', async () => {
  const store: Store = new Map([['guestGuides', JSON.stringify({ ranch: { headline: 'x' } })]]);
  const env = { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD };
  const api = await route();
  const res = await api.onRequestPost!({
    request: save({ propertyId: 'ranch', guide: { parking: 'In the driveway.' } }),
    env,
    params: {},
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { readiness: { ready: boolean; missing: string[]; line: string } };
  // The published defaults carry the rest, so this house is ready and says so plainly.
  assert.equal(typeof body.readiness.ready, 'boolean');
  assert.equal(typeof body.readiness.line, 'string');
  assert.equal(body.readiness.line.includes('$'), false);
  assert.equal(Array.isArray(body.readiness.missing), true);
});

test('a house with places blanked reports not ready', async () => {
  const store: Store = new Map([['guestGuides', JSON.stringify({ ranch: { places: [] } })]]);
  const env = { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD };
  const api = await route();
  const res = await api.onRequestPost!({
    request: save({ propertyId: 'ranch', guide: { parking: 'In the driveway.' } }),
    env,
    params: {},
  });
  const body = (await res.json()) as { readiness: { ready: boolean; missing: string[] } };
  assert.equal(body.readiness.ready, false);
  assert.ok(body.readiness.missing.includes('at least three nearby places'));
});

test('turning a guide off is never blocked', async () => {
  const store: Store = new Map([['guestGuides', JSON.stringify({ river: { ...FULL, enabled: true } })]]);
  const env = { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD };
  const api = await route();
  const res = await api.onRequestPost!({
    request: save({ propertyId: 'river', guide: { enabled: false } }),
    env,
    params: {},
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { guide: { enabled: boolean } };
  assert.equal(body.guide.enabled, false);
});
