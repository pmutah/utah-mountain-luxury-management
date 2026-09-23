/**
 * Run: npx tsx functions/_lib/reservation-merge.test.ts
 * (from web/)
 */
import assert from 'node:assert/strict';
import { applyHostNetFromSeed, resolveIcalPayout } from './reservation-match';
import { resolveIcalSource } from './ical-summary';
import { backfillZeroPayouts, getAllReservations } from './reservations-store';
import { onRequestPatch } from '../api/reservations/[id]';
import type { SettingsEnv } from './kv';
import type { ReservationRecord } from './agent/types';

function memoryEnv(): SettingsEnv & { dump: () => Map<string, string> } {
  const data = new Map<string, string>();
  const SETTINGS = {
    get: async (key: string) => data.get(key) ?? null,
    put: async (key: string, value: string) => {
      data.set(key, value);
    },
  };
  return { SETTINGS: SETTINGS as unknown as SettingsEnv['SETTINGS'], dump: () => data };
}

function stay(
  partial: Pick<ReservationRecord, 'guestName' | 'propertyId' | 'checkIn' | 'checkOut' | 'payout' | 'source'> &
    Partial<ReservationRecord>,
): ReservationRecord {
  return { id: 'row', status: 'confirmed', ...partial };
}

async function testLivePayoutWinsOverSeed() {
  const smelcer = applyHostNetFromSeed(
    stay({
      guestName: 'Kim Smelcer',
      propertyId: 'lindon',
      checkIn: '2026-01-04',
      checkOut: '2026-01-17',
      payout: 927.46,
      source: 'VRBO',
    }),
  );
  assert.equal(smelcer.payout, 927.46);
  assert.equal(smelcer.source, 'VRBO');

  const grover = applyHostNetFromSeed(
    stay({
      guestName: 'Meredyth Grover',
      propertyId: 'lindon',
      checkIn: '2026-04-09',
      checkOut: '2026-04-12',
      payout: 503.37,
      source: 'VRBO',
    }),
  );
  assert.equal(grover.payout, 503.37);
  assert.equal(grover.source, 'VRBO');
}

async function testZeroPayoutStillFillsFromSeed() {
  const filled = applyHostNetFromSeed(
    stay({
      guestName: 'Kim Smelcer',
      propertyId: 'lindon',
      checkIn: '2026-01-04',
      checkOut: '2026-01-17',
      payout: 0,
      source: 'Hospitable',
    }),
  );
  assert.equal(filled.payout, 1811.12);
  assert.equal(filled.source, 'VRBO');

  const keepAmount = applyHostNetFromSeed(
    stay({
      guestName: 'Kim Smelcer',
      propertyId: 'lindon',
      checkIn: '2026-01-04',
      checkOut: '2026-01-17',
      payout: 927.46,
      source: 'Hospitable',
    }),
  );
  assert.equal(keepAmount.payout, 927.46);
  assert.equal(keepAmount.source, 'VRBO');
}

async function testUniqueDatePostKeepsPayout() {
  const row = applyHostNetFromSeed(
    stay({
      guestName: 'Unique Guest',
      propertyId: 'lindon',
      checkIn: '2026-01-18',
      checkOut: '2026-01-20',
      payout: 111.11,
      source: 'Airbnb',
    }),
  );
  assert.equal(row.payout, 111.11);
  assert.equal(row.source, 'Airbnb');
}

async function testHomeAwaySourceWinsOverSeed() {
  const names = [
    ['Bryce Crabbs', '2026-05-22', '2026-05-25'],
    ['Tyneshia Word', '2026-05-28', '2026-06-01'],
    ['serenity post-jones', '2026-06-04', '2026-06-08'],
    ['Matthew Simon', '2026-06-22', '2026-06-26'],
    ['Shanda Evans', '2026-06-29', '2026-07-06'],
  ] as const;
  for (const [guestName, checkIn, checkOut] of names) {
    const row = applyHostNetFromSeed(
      stay({
        guestName,
        propertyId: 'lindon',
        checkIn,
        checkOut,
        payout: 10,
        source: 'HomeAway',
      }),
    );
    assert.equal(row.source, 'HomeAway', guestName);
    assert.equal(row.payout, 10, guestName);
  }
}

async function testGetMergeAndBackfillKeepStoredValues() {
  const env = memoryEnv();
  const custom: ReservationRecord[] = [
    {
      id: 'res-smelcer',
      guestName: 'Kim Smelcer',
      propertyId: 'lindon',
      checkIn: '2026-01-04',
      checkOut: '2026-01-17',
      payout: 927.46,
      source: 'VRBO',
      status: 'confirmed',
      note: 'LIVE Hospitable HA-LDMKG4 host revenue $927.46',
    },
    {
      id: 'res-grover',
      guestName: 'Meredyth Grover',
      propertyId: 'lindon',
      checkIn: '2026-04-09',
      checkOut: '2026-04-12',
      payout: 503.37,
      source: 'VRBO',
      status: 'confirmed',
      note: 'LIVE Hospitable HA-PDWTS8 host revenue $503.37',
    },
  ];
  await env.SETTINGS!.put('reservations', JSON.stringify(custom));
  await env.SETTINGS!.put(
    'reservationOverrides',
    JSON.stringify({
      l1: { status: 'cancelled' },
      l9: { status: 'cancelled' },
      l17: { source: 'HomeAway' },
      l18: { source: 'HomeAway', note: 'source synced VRBO' },
    }),
  );

  const before = await getAllReservations(env);
  const smelcer = before.find((r) => r.guestName === 'Kim Smelcer');
  const grover = before.find((r) => r.guestName === 'Meredyth Grover');
  assert.equal(smelcer?.payout, 927.46);
  assert.equal(grover?.payout, 503.37);
  assert.equal(before.find((r) => r.id === 'l17')?.source, 'HomeAway');
  assert.equal(before.find((r) => r.id === 'l18')?.source, 'HomeAway');
  assert.equal(before.filter((r) => r.guestName === 'Kim Smelcer').length, 1);

  await backfillZeroPayouts(env);
  const stored = JSON.parse(env.dump().get('reservations')!) as ReservationRecord[];
  assert.equal(stored.find((r) => r.id === 'res-smelcer')?.payout, 927.46);
  assert.equal(stored.find((r) => r.id === 'res-grover')?.payout, 503.37);
  const overrides = JSON.parse(env.dump().get('reservationOverrides')!) as Record<string, { source?: string }>;
  assert.equal(overrides.l17?.source, 'HomeAway');
  assert.equal(overrides.l18?.source, 'HomeAway');

  const after = await getAllReservations(env);
  assert.equal(after.find((r) => r.id === 'res-smelcer')?.payout, 927.46);
  assert.equal(after.find((r) => r.id === 'res-grover')?.payout, 503.37);
}

async function testPatchSourcePersistsOnGet() {
  const env = memoryEnv();
  const req = new Request('https://wilhite-portfolio.pages.dev/api/reservations/l18', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: 'HomeAway', note: 'source synced VRBO from Hospitable HA-TKYBPB' }),
  });
  const res = await onRequestPatch({
    request: req,
    env,
    params: { id: 'l18' },
  } as Parameters<typeof onRequestPatch>[0]);
  assert.equal(res.status, 200);
  const patched = (await res.json()) as ReservationRecord;
  assert.equal(patched.source, 'HomeAway');

  const list = await getAllReservations(env);
  assert.equal(list.find((r) => r.id === 'l18')?.source, 'HomeAway');
  assert.equal(list.find((r) => r.id === 'l18')?.payout, 627.69);
}

async function testIcalSyncDoesNotClobberStored() {
  assert.equal(
    resolveIcalPayout(
      { uid: 'u', propertyId: 'lindon', start: '2026-01-04', end: '2026-01-17', source: 'ical' },
      'Kim Smelcer',
      927.46,
    ),
    927.46,
  );
  assert.equal(
    resolveIcalSource('Airbnb reservation', 'channel Airbnb', 'HomeAway', 'Airbnb'),
    'HomeAway',
  );
  assert.equal(resolveIcalSource('Reserved VRBO', undefined, 'Hospitable', 'Airbnb'), 'VRBO');
  assert.equal(
    resolveIcalPayout(
      { uid: 'u2', propertyId: 'lindon', start: '2026-01-04', end: '2026-01-17', source: 'ical' },
      'Kim Smelcer',
      0,
    ),
    1811.12,
  );
}

const tests = [
  testLivePayoutWinsOverSeed,
  testZeroPayoutStillFillsFromSeed,
  testUniqueDatePostKeepsPayout,
  testHomeAwaySourceWinsOverSeed,
  testGetMergeAndBackfillKeepStoredValues,
  testPatchSourcePersistsOnGet,
  testIcalSyncDoesNotClobberStored,
];

for (const test of tests) {
  await test();
  console.log('ok', test.name);
}
console.log('all reservation merge tests passed');
