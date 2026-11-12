/**
 * The availability route must not cost six KV reads per visitor.
 *
 * This is the end-to-end version of `calendar-cache.test.ts`: it calls the real route with a fake KV that counts reads,
 * because the property that matters is "how many times did we ask storage", not "did the helper return a cached value".
 * Production hit its daily KV read limit on 2026-11-12 and the booking site answered `storageReads: "paused"` — the
 * site was up and could not quote a date. Counting the reads is the only evidence that this is fixed.
 *
 * The nights themselves come from the seeded bookings the store merges in, so this asserts that a real, non-empty
 * calendar is served and reused — not a fixture the route would not recognise.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { onRequestGet } from '../../functions/api/book/availability.ts';
import { forgetCalendar } from '../../functions/_lib/public-calendar-cache.ts';

/** A KV that reports how many times it was read. */
function countingKv(seed: Record<string, string> = {}) {
  const map = new Map<string, string>(Object.entries(seed));
  const reads: string[] = [];
  return {
    reads,
    binding: {
      async get(key: string) {
        reads.push(key);
        return map.get(key) ?? null;
      },
      async put(key: string, value: string) {
        map.set(key, value);
      },
    },
  };
}

function context(env: Record<string, unknown>, url = 'https://x/api/book/availability') {
  return {
    request: new Request(url),
    env,
    params: {},
    data: {},
    next: async () => new Response(null),
    waitUntil: () => {},
    passThroughOnException: () => {},
  } as never;
}

type Body = { storageReads: string; nights: Record<string, string[]> | null; closed: unknown };

test('a second guest inside the minute costs no extra KV reads', async () => {
  forgetCalendar();
  const kv = countingKv();
  const env = { SETTINGS: kv.binding };

  const first = await onRequestGet(context(env));
  assert.equal(first.status, 200);
  const afterFirst = kv.reads.length;
  assert.ok(afterFirst > 0, 'the first read did not touch storage at all');
  const firstBody = (await first.json()) as Body;
  assert.equal(firstBody.storageReads, 'ok');
  assert.ok(
    (firstBody.nights?.ranch?.length ?? 0) > 0,
    'the seeded calendar served no booked nights, so this test is not measuring a real payload',
  );

  const second = await onRequestGet(context(env));
  assert.equal(second.status, 200);
  assert.equal(kv.reads.length, afterFirst, 'the second guest re-read the same keys instead of using the cache');

  // And it is the same calendar, not an empty stand-in.
  const secondBody = (await second.json()) as Body;
  assert.deepEqual(secondBody.nights, firstBody.nights, 'the cached payload differs from the built one');
});

test('the response tells browsers and the edge it may be reused briefly', async () => {
  forgetCalendar();
  const kv = countingKv();
  const res = await onRequestGet(context({ SETTINGS: kv.binding }));
  const cache = res.headers.get('cache-control') ?? '';
  assert.match(cache, /max-age=/, 'no max-age, so every view is a fresh request to the Worker');
  assert.match(cache, /stale-while-revalidate/, 'no stale-while-revalidate, so a refresh blocks the guest');
  assert.equal(/no-store|private/i.test(cache), false, 'a public calendar marked no-store can never be reused');
});

test('a paused read still reports paused rather than an empty calendar', async () => {
  /*
   * The cache must not turn a failure into a success. `storageReads: "paused"` is what tells the page to say it could
   * not read dates; an empty `nights` array would instead say every night is free.
   */
  forgetCalendar();
  const failing = {
    async get() {
      throw new Error('KV GET limit exceeded');
    },
    async put() {
      /* not reached */
    },
  };
  const res = await onRequestGet(context({ SETTINGS: failing }));
  assert.equal(res.status, 200);
  const body = (await res.json()) as Body;
  assert.equal(body.storageReads, 'paused');
  assert.equal(body.nights, null, 'a paused read returned a usable night list');
});
