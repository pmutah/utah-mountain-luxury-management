import assert from 'node:assert/strict';
import test from 'node:test';
import { onRequestPost } from '../api/surveys/mint-links.ts';

/*
 * The guest portal was built but unreachable. A portal link is minted only when a host accepts a
 * direct request or sends a survey, so a stay imported from Airbnb or VRBO never got one — and on
 * 2026-11-08 production held 87 real bookings with **zero** portal tokens.
 *
 * These tests pin three things about the backfill that gives them one:
 *   - it sends nothing, because sending is a separate deliberate act;
 *   - it is idempotent, so a second run cannot mint a duplicate or move a guest's live link;
 *   - it does not drop or rewrite bookings, which is the invariant this whole project rests on.
 */

const PASSWORD = 'test-password';
const COOKIE = `wpm_auth=${btoa(`wpm:${PASSWORD}`).replace(/=+$/, '')}`;

type Store = Map<string, string>;

function fakeKv(store: Store) {
  const puts: string[] = [];
  const kv = {
    /** Every put, by key, so a test can assert how many writes one batch took. */
    puts,
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string) {
      puts.push(key);
      store.set(key, value);
    },
  };
  return kv;
}

function writesTo(kv: { puts: string[] }, key: string): number {
  return kv.puts.filter((k) => k === key).length;
}

function res(id: string, checkIn: string, checkOut: string, extra: Record<string, unknown> = {}) {
  /*
   * A distinctive prefix, because `getAllReservations` merges the seed set with the saved list: a
   * fixture called `a1` was measured against ten real seed stays as well, and every count in this file
   * was off by nine. These tests only ever assert on `t-` rows.
   */
  return {
    id: `t-${id}`,
    guestName: `Guest ${id}`,
    propertyId: 'river',
    checkIn,
    checkOut,
    payout: 1000,
    source: 'airbnb',
    status: 'confirmed',
    ...extra,
  };
}

/** The rows this route minted for the fixture's own stays. */
function ours<T extends { reservationId: string }>(rows: T[]): T[] {
  return rows.filter((row) => row.reservationId.startsWith('t-'));
}

/** The last fake KV made by `envWith`, so a test can count writes without changing call sites. */
let lastKv: ReturnType<typeof fakeKv> | null = null;

function envWith(store: Store) {
  lastKv = fakeKv(store);
  return { SETTINGS: lastKv, DASHBOARD_PASSWORD: PASSWORD };
}

function putsTo(key: string): number {
  return lastKv ? writesTo(lastKv, key) : 0;
}

function call(env: unknown, url = 'https://x/api/surveys/mint-links') {
  return onRequestPost!({
    request: new Request(url, { method: 'POST', headers: { Cookie: COOKIE } }),
    env,
    params: {},
  } as never);
}

test('it needs the host', async () => {
  const store: Store = new Map();
  const res400 = await onRequestPost!({
    request: new Request('https://x/api/surveys/mint-links', { method: 'POST' }),
    env: { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD },
    params: {},
  } as never);
  assert.equal(res400.status, 401);
  assert.equal(store.has('guestSurveys'), false);
});

test('an upcoming stay with no link gets one, and nothing is sent', async () => {
  const store: Store = new Map();
  store.set('reservations', JSON.stringify([res('a1', '2026-12-01', '2026-12-04')]));
  const body = (await (await call(envWith(store))).json()) as {
    minted: number;
    sent: number;
    links: Array<{ reservationId: string; link: string }>;
  };

  const mine = ours(body.links);
  assert.equal(mine.length, 1, 'the fixture stay did not get exactly one link');
  assert.equal(body.sent, 0, 'this route must never message a guest');
  assert.match(mine[0]!.link, /\/stay\/[a-f0-9]{32}$/, 'not a stay portal path');

  const savedSurvey = JSON.parse(store.get('guestSurveys')!) as Array<{
    token: string;
    reservationId: string;
    channel?: string;
    sentAt?: string;
  }>;
  const survey = savedSurvey.find((row) => row.reservationId === 't-a1');
  assert.ok(survey, 'no survey was saved for the stay');
  assert.equal(survey.channel, undefined, 'a link that was never sent must not look sent');
  assert.equal(survey.sentAt, undefined);
});

test('the token is written onto the booking, and the row keeps everything else', async () => {
  const store: Store = new Map();
  store.set('reservations', JSON.stringify([res('a1', '2026-12-01', '2026-12-04', { payout: 4321, note: 'keep me' })]));
  await call(envWith(store));

  const saved = JSON.parse(store.get('reservations')!) as Array<Record<string, unknown>>;
  const row = saved.find((r) => r.id === 't-a1');
  assert.ok(row, 'the fixture booking was dropped');
  assert.equal(row.payout, 4321, 'a payout changed');
  assert.equal(row.note, 'keep me', 'a note changed');
  assert.equal(row.surveyChannel, 'none');
  assert.match(String(row.surveyToken), /^[a-f0-9]{32}$/);
});

test('running it twice mints nothing new and never moves a live link', async () => {
  const store: Store = new Map();
  store.set('reservations', JSON.stringify([res('a1', '2026-12-01', '2026-12-04')]));

  const first = (await (await call(envWith(store))).json()) as {
    minted: number;
    links: Array<{ reservationId: string; link: string }>;
  };
  const firstToken = (JSON.parse(store.get('guestSurveys')!) as Array<{ token: string; reservationId: string }>).find(
    (row) => row.reservationId === 't-a1',
  )!.token;

  const second = (await (await call(envWith(store))).json()) as {
    minted: number;
    skipped: number;
    links: Array<{ reservationId: string; link: string }>;
    skippedRows: Array<{ reservationId: string; reason: string }>;
  };
  const secondToken = (JSON.parse(store.get('guestSurveys')!) as Array<{ token: string; reservationId: string }>).find(
    (row) => row.reservationId === 't-a1',
  )!.token;

  assert.equal(ours(first.links).length, 1, 'the first run did not mint the fixture stay');
  assert.equal(ours(second.links).length, 0, 'a second run minted a duplicate link');
  assert.ok(
    second.skippedRows.some((row) => row.reservationId === 't-a1'),
    'the second run did not report the stay as already having a link',
  );
  assert.equal(secondToken, firstToken, "a guest's existing link moved");
});

test('a cancelled stay and a block get no link, and a past stay is skipped by default', async () => {
  const store: Store = new Map();
  store.set(
    'reservations',
    JSON.stringify([
      res('cancelled', '2026-12-01', '2026-12-04', { status: 'cancelled' }),
      res('blocked', '2026-12-01', '2026-12-04', { status: 'blocked' }),
      res('past', '2025-01-01', '2025-01-04'),
      res('live', '2026-12-01', '2026-12-04'),
    ]),
  );
  const body = (await (await call(envWith(store))).json()) as {
    links: Array<{ reservationId: string }>;
  };
  assert.deepEqual(
    ours(body.links).map((row) => row.reservationId),
    ['t-live'],
    'a cancelled, blocked, or finished stay was given a portal link',
  );
});

test('a house whose app is off is named, so a dead link is not passed off as ready', async () => {
  const store: Store = new Map();
  store.set('reservations', JSON.stringify([res('a1', '2026-12-01', '2026-12-04')]));
  const body = (await (await call(envWith(store))).json()) as { guideOff: string[] };
  // No guest-guide config is stored in this fixture, so every house defaults to off.
  assert.ok(body.guideOff.includes('river'), 'the River House app is off and the response did not say so');
});

test('an empty reservation store is not a wipe: nothing is written over it', async () => {
  const store: Store = new Map();
  await call(envWith(store));
  /*
   * With no saved rows the route still sees the seed stays, so it may mint surveys — but it must not
   * create a `reservations` list out of nothing, and the seed stays are not in that list to begin
   * with. The invariant is that no list appears where the store had none.
   */
  assert.equal(store.has('reservations'), false, 'a read-only run wrote a reservation list');
});

test('many stays are minted in a handful of writes, not one per stay', async () => {
  /*
   * This is the bug that cost 14 of the first 25 real stays. `upsertSurveyForStay` saves the whole
   * survey list every time it changes, so looping it is one write per stay to the same key — and
   * Cloudflare allows one write per key per second, so the later ones came back
   * `KV PUT failed: 429 Too Many Requests` and were skipped.
   *
   * The contract is writes that do not scale with the number of stays: at most one for the survey
   * list, one for the custom reservation rows, and one for the seed overrides.
   */
  const store: Store = new Map();
  const stays = Array.from({ length: 20 }, (_, i) =>
    res(`many-${i}`, '2026-12-01', '2026-12-04'),
  );
  store.set('reservations', JSON.stringify(stays));

  const body = (await (await call(envWith(store))).json()) as {
    minted: number;
    links: Array<{ reservationId: string }>;
  };

  assert.equal(ours(body.links).length, 20, 'not every fixture stay was minted');

  const surveyWrites = putsTo('guestSurveys');
  const resWrites = putsTo('reservations');
  assert.equal(surveyWrites, 1, `the survey list was written ${surveyWrites} times for 20 stays`);
  assert.ok(resWrites <= 1, `the custom booking list was written ${resWrites} times for 20 stays`);
  assert.ok(
    surveyWrites + resWrites <= 3,
    `20 stays took ${surveyWrites + resWrites} writes; that is one per stay and will 429 on KV`,
  );
});
