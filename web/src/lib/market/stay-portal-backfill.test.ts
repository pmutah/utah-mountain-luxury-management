import assert from 'node:assert/strict';
import test from 'node:test';
import { backfillStayPortals } from '../../../functions/_lib/stay-portal-backfill.ts';
import { getAllReservations } from '../../../functions/_lib/reservations-store.ts';

/*
 * **A booking that arrived by iCal got no guest portal.**
 *
 * Measured on production on 2026-11-08: 25 upcoming stays, 25 surveys, and the one iCal booking — Michelle Welch,
 * Ranch, April 2027, `icalUid: …@reservations.hospitable.com` — had no token. Her stay page did not exist, and
 * nothing was going to make one: the mint route is host-gated and manual, so an overnight booking sat invisible
 * until somebody remembered to press a button.
 *
 * This runs the same batched, idempotent primitive after every calendar sync. The rules that matter protect a live
 * link: only a *missing* token is minted, an existing one is never touched, and a finished stay gets nothing.
 *
 * **The counts are measured against the seed set, not asserted as absolutes.** `getAllReservations` always merges
 * the 75 seeded rows from `data.ts`, nine of which are upcoming with no token. My first version of these tests
 * asserted `minted === 1` and failed with 10 — the code was right and the fixture was wrong about its own baseline.
 */

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

const later = (days: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const stay = (over: Record<string, unknown>) => ({
  id: 'res-1',
  guestName: 'A Guest',
  propertyId: 'ranch',
  checkIn: later(30),
  checkOut: later(33),
  status: 'confirmed',
  ...over,
});

function seed(stays: Array<Record<string, unknown>>) {
  const store: Store = new Map();
  store.set('reservations', JSON.stringify(stays));
  store.set('guestSurveys', JSON.stringify([]));
  const env = { SETTINGS: fakeKv(store) } as never;
  return { store, env };
}

/** How many stays already qualify, before the one under test is added. */
async function baseline(): Promise<number> {
  const rows = await getAllReservations({ SETTINGS: fakeKv(new Map()) } as never);
  const today = new Date().toISOString().slice(0, 10);
  return rows.filter((row) => row.status !== 'cancelled' && row.status !== 'blocked' && row.checkOut >= today && !row.surveyToken)
    .length;
}

test('a stay that arrived without a portal gets one', async () => {
  const before = await baseline();
  const { env, store } = seed([stay({ id: 'res-ical', icalUid: 'x@reservations.hospitable.com' })]);
  const result = await backfillStayPortals(env);
  assert.equal(result.error, null, `the backfill failed: ${result.error}`);
  assert.equal(result.minted, before + 1, 'the iCal stay was left without a portal');

  const surveys = JSON.parse(store.get('guestSurveys') ?? '[]') as Array<{ reservationId: string; token: string }>;
  const ours = surveys.find((survey) => survey.reservationId === 'res-ical');
  assert.ok(ours, 'no survey was written for the iCal stay');
  assert.ok(ours!.token, 'a survey was written with no token');

  // The token is written back, so the guest list can find it.
  const stays = JSON.parse(store.get('reservations') ?? '[]') as Array<{ id: string; surveyToken?: string }>;
  assert.equal(stays.find((row) => row.id === 'res-ical')!.surveyToken, ours!.token, 'the reservation row was not given the token');
});

test('a stay that already has a portal is not re-minted', async () => {
  /*
   * The rule that protects a guest: overwriting a live token would move their page out from under them, and a
   * reminder already sent would point at the old link.
   */
  const before = await baseline();
  const { env, store } = seed([stay({ id: 'res-live', surveyToken: 'existing-token' })]);
  store.set(
    'guestSurveys',
    JSON.stringify([
      { reservationId: 'res-live', token: 'existing-token', propertyId: 'ranch', guestName: 'A Guest', checkIn: later(30), checkOut: later(33) },
    ]),
  );
  const result = await backfillStayPortals(env);
  // The live stay is already covered, so it must not add to the count.
  assert.equal(result.minted, before, 'an existing portal was re-minted');
  const stays = JSON.parse(store.get('reservations') ?? '[]') as Array<{ id: string; surveyToken?: string }>;
  assert.equal(stays.find((row) => row.id === 'res-live')!.surveyToken, 'existing-token', 'the live token was overwritten');
});

test('a finished stay gets no portal', async () => {
  // Handing a guest a page for a stay that is over is not a kindness. The seed set has none upcoming in the past,
  // so a clean run here means the past stay added nothing.
  const before = await baseline();
  const { env, store } = seed([stay({ id: 'res-past', checkIn: later(-40), checkOut: later(-37) })]);
  const result = await backfillStayPortals(env);
  assert.equal(result.minted, before, 'a past stay was given a portal');
  const surveys = JSON.parse(store.get('guestSurveys') ?? '[]') as Array<{ reservationId: string }>;
  assert.equal(surveys.some((survey) => survey.reservationId === 'res-past'), false);
});

test('a cancelled or blocked stay gets no portal', async () => {
  const before = await baseline();
  const { env, store } = seed([
    stay({ id: 'res-cancelled', status: 'cancelled' }),
    stay({ id: 'res-blocked', status: 'blocked' }),
  ]);
  const result = await backfillStayPortals(env);
  assert.equal(result.minted, before, 'a cancelled or blocked stay was given a portal');
  const surveys = JSON.parse(store.get('guestSurveys') ?? '[]') as Array<{ reservationId: string }>;
  assert.equal(surveys.some((survey) => survey.reservationId.startsWith('res-cancelled')), false);
  assert.equal(surveys.some((survey) => survey.reservationId.startsWith('res-blocked')), false);
});

test('a second run mints nothing, so a sync every hour is safe', async () => {
  /*
   * Idempotence is the whole safety property: this runs after every calendar sync. A second run must change nothing
   * and perform no survey write.
   */
  const { env, store } = seed([stay({ id: 'res-once' })]);
  const first = await backfillStayPortals(env);
  assert.ok(first.minted > 0, 'the first run minted nothing at all');
  const afterFirst = store.get('guestSurveys');

  const second = await backfillStayPortals(env);
  assert.equal(second.minted, 0, 'a repeat run minted again');
  assert.equal(store.get('guestSurveys'), afterFirst, 'a repeat run rewrote the survey store');
});

test('a failed read reports the error and writes nothing', async () => {
  const broken = {
    SETTINGS: {
      get: async () => {
        throw new Error('KV GET limit exceeded');
      },
      put: async () => undefined,
    },
  } as never;
  const result = await backfillStayPortals(broken);
  assert.equal(result.minted, 0);
  assert.ok(result.error, 'a failed read reported success');
});

