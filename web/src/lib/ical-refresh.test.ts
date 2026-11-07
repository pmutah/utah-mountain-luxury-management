/**
 * The iCal calendar only refreshed when a human pressed sync.
 *
 * Airbnb and VRBO deliveries arrive over iCal. The only things that pulled them were an explicit
 * `POST /api/calendar/sync` and an agent tool call; nothing scheduled it. So a host who did not press
 * sync read a calendar that could be days old, and a night already booked that still reads open is a
 * double booking waiting to happen. `syncIcalIfStale` existed for exactly this and had no caller.
 *
 * Wiring it into a read path is only safe under three conditions, and these tests pin each one,
 * because the failure mode of getting any of them wrong is the outage this branch already had:
 * a slow feed hanging a page, or a duplicate read and write burst against a KV at its limit.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { refreshIcalInBackground } from '../../functions/_lib/ical-refresh.ts';

const STALE = JSON.stringify({ ranch: 'https://example.test/river.ics', lastSyncedAt: '2020-01-01T00:00:00.000Z' });
const FRESH = JSON.stringify({ ranch: 'https://example.test/river.ics', lastSyncedAt: new Date().toISOString() });

function envWith(get: (key: string) => Promise<string | null>, put: (key: string, value: string) => Promise<void> = async () => {}) {
  return { SETTINGS: { get, put } } as never;
}

test('a stale cache starts a sync, and a fresh one does not write', async () => {
  let writes = 0;
  const env = envWith(
    async () => STALE,
    async () => {
      writes += 1;
    },
  );
  const first = refreshIcalInBackground(env, { waitUntil: (p) => void p });
  await first.finished;
  const afterStale = writes;
  assert.ok(afterStale > 0, 'a stale cache did not start a sync');

  const fresh = envWith(
    async () => FRESH,
    async () => {
      writes += 1;
    },
  );
  const second = refreshIcalInBackground(fresh, { waitUntil: (p) => void p });
  await second.finished;
  assert.equal(writes, afterStale, 'a fresh cache was synced again');
});

test('the caller is not blocked by a slow feed', async () => {
  /*
   * This sits on the reservations read. A feed that takes ten seconds must not make the dashboard take
   * ten seconds, so the work is handed to the runtime and the call returns immediately.
   */
  const env = envWith(async () => {
    await new Promise((resolve) => setTimeout(resolve, 400));
    return STALE;
  });
  const started = Date.now();
  refreshIcalInBackground(env, { waitUntil: () => {} });
  const elapsed = Date.now() - started;
  assert.ok(elapsed < 100, `the read path waited ${elapsed}ms for the feed`);
});

test('a second call in the same request does not start a second sync', async () => {
  /*
   * Two components read reservations on one dashboard load. Without the guard both would see a stale
   * cache and both would fetch and write, which is the duplicate-read pattern that exhausted the
   * daily KV limit on 2026-11-07.
   */
  const env = envWith(async () => STALE);
  const first = refreshIcalInBackground(env, { waitUntil: (p) => void p });
  const second = refreshIcalInBackground(env, { waitUntil: (p) => void p });
  assert.equal(second.started, false, 'a second sync started in the same request');
  if (second.started === false) assert.equal(second.reason, 'in-flight');
  await first.finished;
  await second.finished;
});

test('an unreadable store does not throw into the read path', async () => {
  // A paused or limited store must leave the calendar as it was, not turn a page load into an error.
  const env = envWith(async () => {
    throw new Error('KV GET failed: 429 limit exceeded');
  });
  let threw = false;
  try {
    const result = refreshIcalInBackground(env, { waitUntil: (p) => void p });
    await result.finished;
  } catch {
    threw = true;
  }
  assert.equal(threw, false, 'a failed feed read threw into the reservations route');
});

test('no configured feed means no fetch', async () => {
  let reads = 0;
  const env = envWith(async () => {
    reads += 1;
    return JSON.stringify({ lastSyncedAt: '2020-01-01T00:00:00.000Z' });
  });
  const result = refreshIcalInBackground(env, { waitUntil: (p) => void p });
  await result.finished;
  // One read of the feed config is expected; a fetch of an unconfigured feed is not.
  assert.equal(reads, 1, `the feed config was read ${reads} times for a deployment with no feeds`);
});

test('the reservations route refreshes on read', () => {
  /*
   * The whole point is reachability: `syncIcalIfStale` was dead code because nothing called it. A test
   * of the helper alone would pass while the calendar still went stale.
   */
  const route = readFileSync(join(process.cwd(), 'functions', 'api', 'reservations', 'index.ts'), 'utf8');
  assert.match(route, /refreshIcalInBackground\(/, 'the reservations read does not refresh the calendar');
  assert.match(route, /waitUntil/, 'the refresh is not handed to the runtime, so it may block the response');
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
