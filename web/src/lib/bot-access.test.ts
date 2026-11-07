/**
 * The bot path. A Grok bot has no cookie, so `dashboard_request` forwards its bearer to the route it
 * calls. If that forwarding ever stopped, every bot would get 401 from the routes built this session
 * while the map still told them the routes exist.
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

const SECRET = 'bot-secret-value';

test('a bot bearer reaches a private route with no cookie', async () => {
  const env = { SETTINGS: fakeKv(new Map()), MUSE_BOT_SECRET: SECRET };
  const mod = (await import('../../functions/api/pricing/push-plan.ts')) as unknown as Record<
    string,
    (ctx: { request: Request; env: unknown; params: Record<string, string> }) => Promise<Response>
  >;
  const res = await mod.onRequestGet!({
    request: new Request('https://x/api/pricing/push-plan', { headers: { Authorization: `Bearer ${SECRET}` } }),
    env,
    params: {},
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { gate: { hasToken: boolean }; sends: boolean };
  assert.equal(body.sends, false);
  assert.equal(typeof body.gate.hasToken, 'boolean');
});

test('a bot bearer reaches the booking inbox and the clean progress list', async () => {
  const env = { SETTINGS: fakeKv(new Map()), AMANDA_BOT_SECRET: SECRET };
  const headers = { Authorization: `Bearer ${SECRET}` };

  const requests = (await import('../../functions/api/book/requests.ts')) as unknown as Record<
    string,
    (ctx: { request: Request; env: unknown; params: Record<string, string> }) => Promise<Response>
  >;
  const inbox = await requests.onRequestGet!({
    request: new Request('https://x/api/book/requests', { headers }),
    env,
    params: {},
  });
  assert.equal(inbox.status, 200);

  const progress = (await import('../../functions/api/clean/progress.ts')) as unknown as Record<
    string,
    (ctx: { request: Request; env: unknown; params: Record<string, string> }) => Promise<Response>
  >;
  const clean = await progress.onRequestGet!({
    request: new Request('https://x/api/clean/progress', { headers }),
    env,
    params: {},
  });
  assert.equal(clean.status, 200);
});

test('a bot bearer cannot read a house code from the public guide path', async () => {
  // A bearer is a host, and a host legitimately reads the guide to edit it. This test pins that the
  // *unauthenticated* path stays blanked even when a bearer exists on the deployment.
  const store: Store = new Map();
  store.set('guestGuides', JSON.stringify({ river: { doorCode: '4821', wifiPassword: 'river-pass' } }));
  const env = { SETTINGS: fakeKv(store), MUSE_BOT_SECRET: SECRET };
  const mod = (await import('../../functions/api/guest-guide.ts')) as unknown as Record<
    string,
    (ctx: { request: Request; env: unknown; params: Record<string, string> }) => Promise<Response>
  >;
  const open = await mod.onRequestGet!({
    request: new Request('https://x/api/guest-guide'),
    env,
    params: {},
  });
  const text = await open.text();
  assert.equal(text.includes('river-pass'), false);
  assert.equal(text.includes('4821'), false);
});
