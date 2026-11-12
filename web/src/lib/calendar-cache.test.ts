/**
 * The public calendar was re-read from KV on every request, and that is what took the booking site down.
 *
 * `/api/book/availability` is the guest site's only source of dates. It read six keys per request — reservations,
 * blocks, holds, approved rates, River part rates, and the internals those touch — for a payload that is public and
 * identical for every visitor. Production answered `storageReads: "paused"` on 2026-11-12 because the daily KV read
 * limit was spent, which meant the site was up and could not quote a single date.
 *
 * The fix is a one-minute in-isolate cache. These tests prove the properties that make it safe rather than the
 * implementation: reads are actually collapsed, a build failure is not cached, the key rotates at midnight so yesterday
 * can never be served as today, and concurrent callers share one build.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { cacheKey, cachedCalendar, forgetCalendar, TTL_MS } from '../../functions/_lib/public-calendar-cache.ts';

test('repeat reads inside the window cost one build', async () => {
  forgetCalendar();
  let builds = 0;
  const build = async () => {
    builds += 1;
    return { nights: [`build-${builds}`] };
  };
  const now = 1_000_000;
  const first = await cachedCalendar('k', build, now);
  const second = await cachedCalendar('k', build, now + 1);
  const third = await cachedCalendar('k', build, now + TTL_MS - 1);
  assert.equal(builds, 1, 'the cache did not collapse repeat reads');
  assert.equal(first.cached, false, 'the first read was reported as cached');
  assert.equal(second.cached, true);
  assert.deepEqual(second.value, first.value, 'the cached value changed');
  assert.deepEqual(third.value, first.value);
});

test('a read past the window builds again', async () => {
  forgetCalendar();
  let builds = 0;
  const build = async () => {
    builds += 1;
    return { n: builds };
  };
  const now = 2_000_000;
  await cachedCalendar('k', build, now);
  const stale = await cachedCalendar('k', build, now + TTL_MS + 1);
  assert.equal(builds, 2, 'an expired entry was still served as fresh');
  assert.equal(stale.cached, false);
  assert.deepEqual(stale.value, { n: 2 }, 'a stale value was returned instead of the fresh one');
});

test('the key rotates at Denver midnight, so yesterday is never served as today', async () => {
  forgetCalendar();
  let builds = 0;
  const build = async () => {
    builds += 1;
    return { day: builds };
  };
  const now = 3_000_000;
  await cachedCalendar(cacheKey('2026-11-12'), build, now);
  const nextDay = await cachedCalendar(cacheKey('2026-11-13'), build, now + 1);
  assert.equal(builds, 2, 'a new day was served from the previous day\'s entry');
  assert.deepEqual(nextDay.value, { day: 2 });
});

test('a failed build is not cached, so the next request retries', async () => {
  forgetCalendar();
  let attempts = 0;
  const failing = async () => {
    attempts += 1;
    throw new Error('KV GET limit exceeded');
  };
  await assert.rejects(() => cachedCalendar('k', failing, 4_000_000), /limit exceeded/);
  /*
   * The route turns this into `storageReads: 'paused'`. If the failure had been cached, every later request in that
   * isolate would keep reporting paused even after KV recovered — the calendar would stay broken for the life of the
   * worker.
   */
  const recovered = await cachedCalendar('k', async () => {
    attempts += 1;
    return { ok: true };
  }, 4_000_001);
  assert.equal(attempts, 2, 'the failed build was cached');
  assert.deepEqual(recovered.value, { ok: true }, 'the recovered build was not used');
});

test('concurrent callers share one build', async () => {
  forgetCalendar();
  let builds = 0;
  let release: (() => void) | null = null;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const slow = async () => {
    builds += 1;
    await gate;
    return { shared: true };
  };
  const first = cachedCalendar('k', slow, 5_000_000);
  const second = cachedCalendar('k', slow, 5_000_000);
  const third = cachedCalendar('k', slow, 5_000_000);
  release?.();
  const results = await Promise.all([first, second, third]);
  assert.equal(builds, 1, 'three simultaneous guests each paid a full set of KV reads');
  for (const row of results) assert.deepEqual(row.value, { shared: true });
});

test('a cached payload carries no guest identity', async () => {
  /*
   * What makes this safe to cache at all: the payload is the public calendar. If a name, email, phone, or token ever
   * reached it, a one-minute shared cache would be handing one guest's details to another.
   */
  forgetCalendar();
  const payload = await cachedCalendar('k', async () => ({
    nights: { ranch: [], lindon: [], river: [] },
    closed: { ranch: [], lindon: [], river: [] },
    held: { ranch: [], lindon: [], river: [] },
    pace: { ranch: 'short', lindon: 'met', river: 'unknown' },
  }), 6_000_000);
  const text = JSON.stringify(payload.value);
  assert.equal(/guestName|guestEmail|guestPhone|@|token/i.test(text), false, 'the cached payload carries guest identity');
});

test('a booking clears the cache, because the calendar it holds is now wrong', () => {
  /*
   * The cache is only safe if every write that changes the answer clears it. Accepting a booking takes nights, and
   * declining one frees them; either way the cached minute would describe a calendar that no longer exists.
   *
   * A stale minute cannot double-book — `POST /api/book` re-reads the calendar before it holds anything — but it can
   * show a guest a night that is already gone, which is the exact complaint this cache is trying not to create.
   *
   * These are source guards because the defect would be a *missing* call in a route, which no unit test of the cache
   * itself can see.
   */
  const accept = readFileSync(new URL('../../functions/api/book/accept.ts', import.meta.url), 'utf8');
  assert.match(accept, /forgetCalendar\(\)/, 'accepting a booking does not clear the public calendar cache');

  const decline = readFileSync(new URL('../../functions/api/book/decline.ts', import.meta.url), 'utf8');
  assert.match(decline, /forgetCalendar\(\)/, 'a decline frees nights but does not clear the calendar cache');

  const availability = readFileSync(new URL('../../functions/api/book/availability.ts', import.meta.url), 'utf8');
  assert.match(availability, /cachedCalendar\(/, 'the availability route stopped using the cache');
  assert.match(availability, /Cache-Control/, 'the availability route sends no cache header, so every view refetches');
});
