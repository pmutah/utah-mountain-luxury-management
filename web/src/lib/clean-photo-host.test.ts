/**
 * The loop that matters: a cleaner uploads a room photo, and the host desk counts it. Before this,
 * the desk only counted photos attached in the desk's own browser tab, so a cleaner's upload read as
 * unfinished work.
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

function futureCheckout(daysAhead: number) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver' }).format(new Date());
  const day = new Date(`${today}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + daysAhead);
  return { today, checkout: day.toISOString().slice(0, 10) };
}

function seed(store: Store, house: string, checkout: string, today: string) {
  store.set(
    'reservations',
    JSON.stringify([
      { id: `test-loop-${house}`, guestName: 'Ada Lovelace', propertyId: house, checkIn: today, checkOut: checkout, payout: 1, source: 'Airbnb', status: 'confirmed' },
    ]),
  );
  store.set(
    'cleanPhotos',
    JSON.stringify([
      {
        house,
        checkout,
        path: `clean-photos/${house}/${checkout}/abc12345.jpg`,
        contentType: 'image/jpeg',
        bytes: 800,
        uploadedAt: new Date().toISOString(),
      },
    ]),
  );
}

async function hostPhotos(store: Store) {
  const mod = (await import('../../functions/api/clean/photos.ts')) as unknown as Record<string, RouteHandler>;
  return mod.onRequestGet!({
    request: new Request('https://x/api/clean/photos', { headers: { Cookie: cookie } }),
    env: { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD },
    params: {},
  });
}

test('the host photo list is host only', async () => {
  const mod = (await import('../../functions/api/clean/photos.ts')) as unknown as Record<string, RouteHandler>;
  const res = await mod.onRequestGet!({
    request: new Request('https://x/api/clean/photos'),
    env: { SETTINGS: fakeKv(new Map()), DASHBOARD_PASSWORD: PASSWORD },
    params: {},
  });
  assert.equal(res.status, 401);
});

test("a cleaner's uploaded photo reaches the host desk", async () => {
  const store: Store = new Map();
  const { today, checkout } = futureCheckout(3);
  seed(store, 'river', checkout, today);
  const res = await hostPhotos(store);
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    turns: Record<string, Array<{ path: string; label: string; url: string }>>;
    counts: Record<string, string>;
    storageReads: string;
  };
  const key = `river:${checkout}`;
  assert.equal(body.storageReads, 'ok');
  assert.equal(body.turns[key]?.length, 1);
  assert.match(body.turns[key]![0]!.label, /^Photo at /);
  assert.match(body.turns[key]![0]!.url, /^\/api\/clean\/photo\?path=/);
  assert.match(body.counts[key] ?? '', /1 room photo/);
  assert.equal(/ready|cleaned|approved/i.test(body.counts[key] ?? ''), false);
  assert.equal(JSON.stringify(body).includes('Ada Lovelace'), false);
});

test('the count for a turn with a photo is not zero, which is what closes the step', async () => {
  const store: Store = new Map();
  const { today, checkout } = futureCheckout(3);
  seed(store, 'ranch', checkout, today);
  const res = await hostPhotos(store);
  const body = (await res.json()) as { turns: Record<string, unknown[]> };
  const count = body.turns[`ranch:${checkout}`]?.length ?? 0;
  assert.ok(count > 0, 'the desk would still read this turn as having no photo');
});

test('a photo on a house and day that is not a live turn is not listed', async () => {
  const store: Store = new Map();
  const { today, checkout } = futureCheckout(3);
  seed(store, 'river', checkout, today);
  // A photo row for a turn that is not on the desk.
  store.set(
    'cleanPhotos',
    JSON.stringify([
      { house: 'lindon', checkout: '2020-01-02', path: 'clean-photos/lindon/2020-01-02/zzzz9999.jpg', contentType: 'image/jpeg', bytes: 1, uploadedAt: new Date().toISOString() },
    ]),
  );
  const res = await hostPhotos(store);
  const body = (await res.json()) as { turns: Record<string, unknown[]> };
  // The live River turn is listed with no photos; the stale Lindon day is not listed at all.
  assert.equal(body.turns[`river:${checkout}`]?.length, 0);
  assert.equal('lindon:2020-01-02' in body.turns, false);
  const total = Object.values(body.turns).reduce((sum, photos) => sum + photos.length, 0);
  assert.equal(total, 0, 'a photo from a non-live day reached the desk');
});

test('a paused photo store is named rather than read as no photos', async () => {
  const mod = (await import('../../functions/api/clean/photos.ts')) as unknown as Record<string, RouteHandler>;
  const failing = {
    async get(key: string) {
      if (key === 'cleanPhotos') throw new Error('KV GET limit exceeded');
      return null;
    },
    async put() {},
  };
  const res = await mod.onRequestGet!({
    request: new Request('https://x/api/clean/photos', { headers: { Cookie: cookie } }),
    env: { SETTINGS: failing, DASHBOARD_PASSWORD: PASSWORD },
    params: {},
  });
  assert.equal(res.status, 503);
  const body = (await res.json()) as { turns: unknown; storageReads: string };
  assert.equal(body.turns, null);
  assert.equal(body.storageReads, 'paused');
});

test('the host photo read refuses a path that is not ours', async () => {
  const mod = (await import('../../functions/api/clean/photo.ts')) as unknown as Record<string, RouteHandler>;
  for (const path of ['receipts/river/2026-11-14/x.jpg', 'clean-photos/../../etc/passwd', 'clean-photos/river/2026-13-01/x.jpg']) {
    const res = await mod.onRequestGet!({
      request: new Request(`https://x/api/clean/photo?path=${encodeURIComponent(path)}`, { headers: { Cookie: cookie } }),
      env: { SETTINGS: fakeKv(new Map()), DASHBOARD_PASSWORD: PASSWORD },
      params: {},
    });
    assert.equal(res.status, 400, `path was not refused: ${path}`);
  }
});
