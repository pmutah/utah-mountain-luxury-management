/**
 * The rate push plan route. The point of these tests is that a plan cannot leave with a price when
 * a gate is closed, and that this route has no way to send at all.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { denverToday } from './market/dates.ts';

type Store = Map<string, string>;

function fakeKv(store: Store, opts: { failKey?: string } = {}) {
  return {
    async get(key: string) {
      if (opts.failKey && key === opts.failKey) throw new Error('KV GET limit exceeded');
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

type PlanBody = {
  plans: Array<{ house: string; allowed: boolean; hold: string | null; nights: unknown[]; lines: string[]; payload: unknown }>;
  summary: string;
  gate: { shadowReady: boolean; hasToken: boolean; paused: boolean; calendarReady: boolean };
  shadowDays: { days: number; required: number; ready: boolean };
  storageReads: string;
  sends: boolean;
};

async function route() {
  return (await import('../../functions/api/pricing/push-plan.ts')) as unknown as Record<string, RouteHandler>;
}

/**
 * A market database that answers the kill-switch statements.
 *
 * `paused` is a map of house to true. A house with no row is not paused, which is what the real table means by "never set".
 * Any other statement returns nothing, so a route reading this database cannot accidentally see invented rows.
 */
function fakeDb(paused: Record<string, boolean> = {}) {
  const rows = Object.entries(paused).map(([house, value]) => ({ house, paused: value ? 1 : 0, reason: null }));
  return {
    prepare(sql: string) {
      const statement = {
        bind: () => statement,
        async all() {
          if (/FROM house_pause/.test(sql)) return { results: rows };
          return { results: [] };
        },
        async run() {
          return { success: true };
        },
      };
      return statement;
    },
  };
}

function sevenDays() {
  const days = [];
  // Denver's date: the route compares against `denverToday()`, and a UTC today is a day ahead
  // for six hours each evening, so the newest day was counted as a future date and dropped.
  const today = new Date(`${denverToday()}T00:00:00Z`);
  for (let back = 6; back >= 0; back -= 1) {
    const day = new Date(today);
    day.setUTCDate(day.getUTCDate() - back);
    days.push({ date: day.toISOString().slice(0, 10), digest: 'Shadow day. 3 saved comps. Nothing sent to Hospitable.' });
  }
  return days;
}

function call(env: unknown, withCookie = true) {
  return new Request('https://x/api/pricing/push-plan', {
    headers: withCookie ? { Cookie: cookie } : {},
  });
}

test('the plan route is host only', async () => {
  const env = { SETTINGS: fakeKv(new Map()), DASHBOARD_PASSWORD: PASSWORD };
  const mod = await route();
  const res = await mod.onRequestGet!({ request: call(env, false), env, params: {} });
  assert.equal(res.status, 401);
});

test('with no write token the plan previews its nights and still carries no payload', async () => {
  const store: Store = new Map();
  store.set('shadowDays', JSON.stringify(sevenDays()));
  const env = { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD };
  const mod = await route();
  const res = await mod.onRequestGet!({ request: call(env), env, params: {} });
  assert.equal(res.status, 200);
  const body = (await res.json()) as PlanBody;
  assert.equal(body.gate.hasToken, false);
  assert.equal(body.gate.shadowReady, true);
  for (const plan of body.plans) {
    /*
     * No token is a permission gate, not a data gate: the nights stay visible so the desk can see what
     * would change, but `payload` is null so nothing could ever be sent from a preview.
     */
    assert.equal(plan.allowed, false);
    assert.equal(plan.payload, null, 'a plan without a token must carry no payload');
  }
  assert.match(body.summary, /No rate is sent/);
  assert.equal(body.summary.includes('$'), false);
});

test('with fewer than seven shadow days the plan is blocked', async () => {
  const store: Store = new Map();
  store.set('shadowDays', JSON.stringify(sevenDays().slice(0, 3)));
  const env = { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD, HOSPITABLE_WRITE_TOKEN: 'token' };
  const mod = await route();
  const res = await mod.onRequestGet!({ request: call(env), env, params: {} });
  const body = (await res.json()) as PlanBody;
  assert.equal(body.shadowDays.days, 3);
  assert.equal(body.gate.shadowReady, false);
  for (const plan of body.plans) assert.equal(plan.allowed, false);
});

test('with both gates open the plan may carry nights, and still never sends', async () => {
  const store: Store = new Map();
  store.set('shadowDays', JSON.stringify(sevenDays()));
  const env = {
    SETTINGS: fakeKv(store),
    DASHBOARD_PASSWORD: PASSWORD,
    HOSPITABLE_WRITE_TOKEN: 'token',
    // No house is paused. Without this the switch reads unreadable and every house is treated as paused, which is the
    // correct behaviour but would make this test assert the opposite of what it is for.
    MARKET_DB: fakeDb(),
  };
  const mod = await route();
  const res = await mod.onRequestGet!({ request: call(env), env, params: {} });
  const body = (await res.json()) as PlanBody;
  assert.equal(body.gate.hasToken, true);
  assert.equal(body.gate.shadowReady, true);
  assert.equal(body.gate.paused, false, 'a bound switch with no paused house reported paused');
  assert.equal(body.sends, false);
  // Every plan is allowed once the gates are open; whether it has nights depends on the board.
  for (const plan of body.plans) {
    assert.equal(plan.allowed, true);
    if (plan.nights.length === 0) assert.equal(plan.payload, null);
    else assert.ok(plan.payload);
  }
  // The write token itself is never echoed.
  const text = JSON.stringify(body);
  assert.equal(text.includes('token"') && text.includes('"token"'), false);
});

test('a paused house is held even when every other gate is open', async () => {
  const store: Store = new Map();
  store.set('shadowDays', JSON.stringify(sevenDays()));
  const env = {
    SETTINGS: fakeKv(store),
    DASHBOARD_PASSWORD: PASSWORD,
    HOSPITABLE_WRITE_TOKEN: 'token',
    MARKET_DB: fakeDb({ river: true }),
  };
  const mod = await route();
  const res = await mod.onRequestGet!({ request: call(env), env, params: {} });
  const body = (await res.json()) as PlanBody;
  const river = body.plans.find((plan) => plan.house === 'river');
  assert.ok(river, 'the river plan is missing');
  // A paused house proposes nothing, whatever the shadow clock and the token say.
  assert.equal(river.allowed, false, 'a paused house was allowed to carry a price');
  assert.equal(river.payload, null, 'a paused house carried a payload');
  assert.match(river.hold ?? '', /paused/i, 'the paused house does not say why it is held');
  assert.equal(body.gate.paused, true, 'the gate does not report that a house is paused');
  // The other two houses are unaffected by River's switch.
  for (const plan of body.plans.filter((row) => row.house !== 'river')) {
    assert.equal(plan.allowed, true, `${plan.house} was held by another house's switch`);
  }
});

test('an unreadable switch pauses every house rather than claiming they are live', async () => {
  const store: Store = new Map();
  store.set('shadowDays', JSON.stringify(sevenDays()));
  // No MARKET_DB at all: the switch cannot be read.
  const env = { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD, HOSPITABLE_WRITE_TOKEN: 'token' };
  const mod = await route();
  const res = await mod.onRequestGet!({ request: call(env), env, params: {} });
  const body = (await res.json()) as PlanBody & { pause?: { readable: boolean; paused: Record<string, boolean> } };
  assert.equal(body.pause?.readable, false, 'an unreadable switch reported itself as readable');
  assert.deepEqual(body.pause?.paused, { ranch: true, lindon: true, river: true }, 'an unreadable switch did not pause every house');
  for (const plan of body.plans) {
    assert.equal(plan.allowed, false, `${plan.house} was allowed while its switch could not be read`);
  }
});

test('a paused shadow day does not count toward the gate', async () => {
  const store: Store = new Map();
  const days = sevenDays();
  days[0] = { date: days[0]!.date, digest: 'The calendar could not be read. No night is raised or promoted.' };
  store.set('shadowDays', JSON.stringify(days));
  const env = { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD, HOSPITABLE_WRITE_TOKEN: 'token' };
  const mod = await route();
  const res = await mod.onRequestGet!({ request: call(env), env, params: {} });
  const body = (await res.json()) as PlanBody;
  assert.equal(body.shadowDays.days, 6);
  assert.equal(body.gate.shadowReady, false);
});

test('an unreadable store is named instead of showing an empty plan', async () => {
  const env = {
    SETTINGS: fakeKv(new Map(), { failKey: 'shadowDays' }),
    DASHBOARD_PASSWORD: PASSWORD,
    HOSPITABLE_WRITE_TOKEN: 'token',
  };
  const mod = await route();
  const res = await mod.onRequestGet!({ request: call(env), env, params: {} });
  assert.equal(res.status, 503);
  const body = (await res.json()) as { plans: unknown; summary: unknown; storageReads: string };
  assert.equal(body.plans, null);
  assert.equal(body.summary, null);
  assert.equal(body.storageReads, 'paused');
});
