/**
 * The morning run.
 *
 * The defect this file protects against is the one the plan names: the seven-day shadow clock advanced only when a host opened a
 * page, so a week of not looking was a week of not qualifying, and nothing told him anything unless he went looking.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cronAuthorized } from '../../../functions/_lib/roles.ts';
import { daySawRealComps } from '../market/shadow-log.ts';
import { onRequestGet, onRequestPost } from '../../../functions/api/platform/daily.ts';

const root = join(process.cwd());

function fakeKv(seed: Record<string, string> = {}) {
  const map = new Map<string, string>(Object.entries(seed));
  return {
    get: async (key: string) => map.get(key) ?? null,
    put: async (key: string, value: string) => void map.set(key, value),
    raw: map,
  };
}

/** The shape a PagesFunction receives. `env` carries the KV binding the route reads. */
function context(env: Record<string, unknown>, request: Request) {
  return { request, env, params: {}, data: {}, next: async () => new Response(null), waitUntil: () => {}, passThroughOnException: () => {} } as never;
}

test('a hand-written digest cannot satisfy the shadow gate', () => {
  /*
   * The hole this closes, and it was mine. `daySawRealComps` rejects a digest that *says* "sample comps" — so a digest that says nothing
   * about comps at all passes it. The morning run's first version composed exactly such a line, which means seven mornings of a run that
   * never read a comp would have unlocked the rate switch on a market nobody measured. That is the failure the gate exists to prevent.
   *
   * The run now reads the board and refuses to record a day whose measured nights are too thin, so the test asserts both halves: the
   * predicate is not fooled by silence, and the route refuses on a thin market.
   */
  const silent = `Morning run for 2026-11-12. 0 arriving, 0 leaving, 0 nights no stay can sell inside 14 days. Nothing sent to Hospitable.`;
  // The raw predicate is fooled by a silent digest — this is why the route must not rely on it alone.
  assert.equal(daySawRealComps(silent), true, 'the predicate is stricter than expected; the route guard may be redundant');

  // The route's own gate: a house needs five measured nights, and the day records only the houses that carry a market.
  const route = readFileSync(join(root, 'functions/api/platform/daily.ts'), 'utf8');
  assert.match(route, /MIN_MEASURED_NIGHTS = 5/, 'the minimum measured nights changed without a decision');
  assert.match(route, /nights >= MIN_MEASURED_NIGHTS/, 'the morning run records a shadow day from a thin market');
  assert.match(route, /readMarketBoard\(/, 'the morning run composes a digest instead of reading the board');
  assert.match(route, /after\.dates\.includes\(today\)/, 'the run does not check that the day it wrote actually counts');
  /*
   * Per house, not one floor. A minimum across the three would let the thinnest house refuse a day for the two that are measured — production
   * sits at River 23, Ranch 18, Lindon 5, so one fewer Lindon night would have silenced the whole digest.
   */
  assert.doesNotMatch(route, /Math\.min\(\.\.\.rows/, 'the market gate is a minimum across houses again');
  assert.match(route, /measured\.length === 0/, 'the run does not refuse when no house is measured');
  assert.match(route, /thin/, 'the digest does not name the houses too thin to set a band');
});

test('the cron secret is not a host bearer', () => {
  /*
   * This is the whole reason the check lives in `roles.ts` and not in `hostOnly`. A cron secret that signed in like a host would
   * unlock the ledger, the receipts, and the guest surveys to anyone holding it.
   */
  const secret = 'a-cron-secret-of-decent-length';
  const ok = new Request('https://x/api/platform/daily', { headers: { Authorization: `Bearer ${secret}` } });
  assert.equal(cronAuthorized(ok, { CRON_SECRET: secret }), true);
  // Wrong secret, no secret configured, no header, a shorter value, and a value of the right length that differs.
  assert.equal(cronAuthorized(new Request('https://x/', { headers: { Authorization: 'Bearer wrong' } }), { CRON_SECRET: secret }), false);
  assert.equal(cronAuthorized(ok, {}), false, 'an unset CRON_SECRET authorised a bearer');
  assert.equal(cronAuthorized(new Request('https://x/'), { CRON_SECRET: secret }), false);
  assert.equal(cronAuthorized(new Request('https://x/', { headers: { Authorization: `Bearer ${secret.slice(0, -1)}` } }), { CRON_SECRET: secret }), false);
  assert.equal(
    cronAuthorized(new Request('https://x/', { headers: { Authorization: `Bearer ${'b'.repeat(secret.length)}` } }), { CRON_SECRET: secret }),
    false,
  );
  // And it is not part of hostOnly, so another route cannot be unlocked by it.
  const auth = readFileSync(join(root, 'functions/_lib/auth.ts'), 'utf8');
  assert.doesNotMatch(auth, /CRON_SECRET/, 'hostOnly learned the cron secret, so it unlocks every host route');
  // The middleware lets it through for one path only.
  const middleware = readFileSync(join(root, 'functions/_middleware.ts'), 'utf8');
  assert.match(middleware, /url\.pathname === '\/api\/platform\/daily' && cronAuthorized/, 'the cron gate is not scoped to one route');
});

test('the morning run refuses to build a digest from unreadable books', async () => {
  /*
   * A digest from an unread calendar would say "no arrival, no night at risk" — and a host reading that concludes the day is clear.
   * The route refuses instead, and the response says nothing was sent.
   */
  const env = {
    DASHBOARD_PASSWORD: 'pw',
    CRON_SECRET: 'a-cron-secret',
    HOST_DIGEST_TO: '+18015551234',
    SETTINGS: {
      get: async () => {
        throw new Error('KV read failed');
      },
      put: async () => undefined,
    },
  };
  const response = (await onRequestPost(
    context(env, new Request('https://x/api/platform/daily', { method: 'POST', headers: { Authorization: 'Bearer a-cron-secret' } })),
  )) as Response;
  assert.equal(response.status, 503);
  const body = (await response.json()) as { ok: boolean; sent: boolean; reason: string };
  assert.equal(body.ok, false);
  assert.equal(body.sent, false);
  assert.match(body.reason, /could not be read/);
});

test('with the digest switch off, the run composes the text and sends nothing', async () => {
  /*
   * The safe default. A cron that texts without the owner's switch would be a message from an automation he never turned on, which
   * is the one thing this platform does not do.
   */
  const kv = fakeKv();
  const env = {
    DASHBOARD_PASSWORD: 'pw',
    CRON_SECRET: 'a-cron-secret',
    HOST_DIGEST_TO: '+18015551234',
    TWILIO_ACCOUNT_SID: 'AC-test',
    TWILIO_AUTH_TOKEN: 'token',
    TWILIO_SMS_FROM: '+18015550000',
    SETTINGS: kv,
  };
  const response = (await onRequestPost(
    context(env, new Request('https://x/api/platform/daily', { method: 'POST', headers: { Authorization: 'Bearer a-cron-secret' } })),
  )) as Response;
  assert.equal(response.status, 200);
  const body = (await response.json()) as { ok: boolean; sent: boolean; sendNote: string; body: string; switches: unknown };
  assert.equal(body.ok, true, 'a run with an unreadable booking store must not be a success');
  assert.equal(body.sent, false);
  assert.match(body.sendNote, /switch is off/);
  // The text was still composed, so a host can read what it would say.
  assert.match(body.body, /Utah Mountain Luxury/);
  assert.match(body.body, /not sent|nothing was sent|switch is off/i.test(body.sendNote) ? /./ : /never/, 'the body must exist');
  // No send is claimed anywhere, and no day was claimed for sending.
  assert.equal(kv.raw.has('digestSent'), false, 'a day was claimed without sending');
});

test('the text is sent at most once a date, even on a retry', async () => {
  /*
   * A worker retry is normal; a second identical text is noise. The date is claimed **before** the send, so a crash loses one
   * morning rather than delivering two.
   */
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver' }).format(new Date());
  const kv = fakeKv({
    agentSwitches: JSON.stringify({ digest: true, snow: false, shadowDay: false }),
    digestSent: JSON.stringify([today]),
  });
  const env = {
    DASHBOARD_PASSWORD: 'pw',
    CRON_SECRET: 'a-cron-secret',
    HOST_DIGEST_TO: '+18015551234',
    TWILIO_ACCOUNT_SID: 'AC-test',
    TWILIO_AUTH_TOKEN: 'token',
    TWILIO_SMS_FROM: '+18015550000',
    SETTINGS: kv,
  };
  const response = (await onRequestPost(
    context(env, new Request('https://x/api/platform/daily', { method: 'POST', headers: { Authorization: 'Bearer a-cron-secret' } })),
  )) as Response;
  const body = (await response.json()) as { sent: boolean; sendNote: string };
  assert.equal(body.sent, false);
  assert.match(body.sendNote, /already went out today|Nothing was sent twice/);
});

test('a run with no recipient set does not pretend to have texted anyone', async () => {
  const kv = fakeKv({ agentSwitches: JSON.stringify({ digest: true, snow: false, shadowDay: false }) });
  const env = {
    DASHBOARD_PASSWORD: 'pw',
    CRON_SECRET: 'a-cron-secret',
    TWILIO_ACCOUNT_SID: 'AC-test',
    TWILIO_AUTH_TOKEN: 'token',
    TWILIO_SMS_FROM: '+18015550000',
    SETTINGS: kv,
  };
  const response = (await onRequestPost(
    context(env, new Request('https://x/api/platform/daily', { method: 'POST', headers: { Authorization: 'Bearer a-cron-secret' } })),
  )) as Response;
  const body = (await response.json()) as { sent: boolean; sendNote: string };
  assert.equal(body.sent, false);
  assert.match(body.sendNote, /HOST_DIGEST_TO/);
});

test('the read route reports what the run would use and sends nothing', async () => {
  const kv = fakeKv({ agentSwitches: JSON.stringify({ digest: false, snow: true, shadowDay: false }) });
  const response = (await onRequestGet(
    context(
      {
        DASHBOARD_PASSWORD: 'pw',
        CRON_SECRET: 'a-cron-secret',
        HOST_DIGEST_TO: '+18015551234',
        TWILIO_ACCOUNT_SID: 'AC-test',
        TWILIO_AUTH_TOKEN: 'token',
        TWILIO_SMS_FROM: '+18015550000',
        SETTINGS: kv,
      },
      new Request('https://x/api/platform/daily', { headers: { Authorization: 'Bearer a-cron-secret' } }),
    ),
  )) as Response;
  assert.equal(response.status, 200);
  const body = (await response.json()) as { sends: boolean; twilio: boolean; recipientSet: boolean };
  assert.equal(body.sends, false);
  assert.equal(body.twilio, true);
  assert.equal(body.recipientSet, true);
  assert.equal(kv.raw.has('digestSent'), false, 'a read claimed a send');
});

test('an unsigned caller is refused', async () => {
  const env = { DASHBOARD_PASSWORD: 'pw', SETTINGS: fakeKv() };
  const response = (await onRequestPost(context(env, new Request('https://x/api/platform/daily', { method: 'POST' })))) as Response;
  assert.equal(response.status, 401);
});

test('the worker calls the route on the morning run and not the afternoon one', () => {
  const worker = readFileSync(join(root, '../worker/src/index.ts'), 'utf8');
  // One call, with the secret, to the one route.
  assert.match(worker, /\/api\/platform\/daily/);
  assert.match(worker, /Authorization: `Bearer \$\{secret\}`/);
  assert.match(worker, /event\.cron === '0 12 \* \* \*'/, 'the worker does not distinguish the morning run');
  // A missing secret is logged rather than silently doing nothing.
  assert.match(worker, /CRON_SECRET is not set/);
  assert.match(worker, /books: 'untouched'/);
});
