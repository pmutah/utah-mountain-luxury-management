/**
 * Cleaner room photos. The link is a public credential, so these tests pin what it cannot do:
 * attach to a turn that is not on its list, read another folder, or accept a file the rules refuse.
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

/** A minimal valid JPEG marker so the byte count is real without a huge fixture. */
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]).toString('base64');

function futureCheckout(daysAhead: number) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver' }).format(new Date());
  const day = new Date(`${today}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + daysAhead);
  return { today, checkout: day.toISOString().slice(0, 10) };
}

async function mint(store: Store) {
  const links = (await import('../../functions/api/clean/links.ts')) as unknown as Record<string, RouteHandler>;
  const res = await links.onRequestPost!({
    request: new Request('https://x/api/clean/links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ label: 'Maria' }),
    }),
    env: { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD },
    params: {},
  });
  return (await res.json()) as { token: string };
}

function seedStay(store: Store, propertyId: string, checkout: string, checkIn: string) {
  store.set(
    'reservations',
    JSON.stringify([
      {
        id: `test-photo-${propertyId}`,
        guestName: 'Ada Lovelace',
        propertyId,
        checkIn,
        checkOut: checkout,
        payout: 1,
        source: 'Airbnb',
        status: 'confirmed',
      },
    ]),
  );
}

/** Storage is "configured" here via a fake service account; the upload is stubbed by the env shape. */
const STORAGE_ENV = {
  FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({
    project_id: 'test',
    client_email: 'test@test.iam.gserviceaccount.com',
    private_key: 'not-a-real-key',
  }),
  FIREBASE_STORAGE_BUCKET: 'test-bucket',
};

test('a photo route refuses a link that was never minted', async () => {
  const store: Store = new Map();
  const { checkout, today } = futureCheckout(3);
  seedStay(store, 'river', checkout, today);
  const env = { SETTINGS: fakeKv(store), ...STORAGE_ENV };
  const photos = (await import('../../functions/api/clean/[token]/photos.ts')) as unknown as Record<string, RouteHandler>;
  const res = await photos.onRequestGet!({
    request: new Request(`https://x/api/clean/${'f'.repeat(32)}/photos?house=river&checkout=${checkout}`),
    env,
    params: { token: 'f'.repeat(32) },
  });
  assert.equal(res.status, 404);
});

test('the photo list for a turn starts empty and says so', async () => {
  const store: Store = new Map();
  const { checkout, today } = futureCheckout(3);
  seedStay(store, 'river', checkout, today);
  const { token } = await mint(store);
  const env = { SETTINGS: fakeKv(store), ...STORAGE_ENV };
  const photos = (await import('../../functions/api/clean/[token]/photos.ts')) as unknown as Record<string, RouteHandler>;
  const res = await photos.onRequestGet!({
    request: new Request(`https://x/api/clean/${token}/photos?house=river&checkout=${checkout}`),
    env,
    params: { token },
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { photos: unknown[]; line: string };
  assert.deepEqual(body.photos, []);
  assert.match(body.line, /No room photo on this turn yet/);
  assert.equal(/ready|cleaned|approved/i.test(body.line), false);
});

test('a turn that is not on the list cannot take a photo', async () => {
  const store: Store = new Map();
  const { checkout, today } = futureCheckout(3);
  seedStay(store, 'river', checkout, today);
  const { token } = await mint(store);
  const env = { SETTINGS: fakeKv(store), ...STORAGE_ENV };
  const photos = (await import('../../functions/api/clean/[token]/photos.ts')) as unknown as Record<string, RouteHandler>;

  // The Ranch has no turnover, so this house/day pair is not on the list.
  const wrongHouse = await photos.onRequestPost!({
    request: new Request(`https://x/api/clean/${token}/photos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ house: 'ranch', checkout, contentType: 'image/jpeg', base64: JPEG }),
    }),
    env,
    params: { token },
  });
  assert.equal(wrongHouse.status, 404);

  const noHouse = await photos.onRequestPost!({
    request: new Request(`https://x/api/clean/${token}/photos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checkout, contentType: 'image/jpeg', base64: JPEG }),
    }),
    env,
    params: { token },
  });
  assert.equal(noHouse.status, 400);
  assert.equal(store.has('cleanPhotos'), false);
});

test('a refused file type writes nothing', async () => {
  const store: Store = new Map();
  const { checkout, today } = futureCheckout(3);
  seedStay(store, 'river', checkout, today);
  const { token } = await mint(store);
  const env = { SETTINGS: fakeKv(store), ...STORAGE_ENV };
  const photos = (await import('../../functions/api/clean/[token]/photos.ts')) as unknown as Record<string, RouteHandler>;
  const res = await photos.onRequestPost!({
    request: new Request(`https://x/api/clean/${token}/photos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ house: 'river', checkout, contentType: 'application/pdf', base64: JPEG }),
    }),
    env,
    params: { token },
  });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { error: string };
  assert.match(body.error, /JPEG, a PNG, or a WebP/);
  assert.equal(store.has('cleanPhotos'), false);
});

test('an oversized photo is refused on the decoded bytes', async () => {
  const store: Store = new Map();
  const { checkout, today } = futureCheckout(3);
  seedStay(store, 'river', checkout, today);
  const { token } = await mint(store);
  const env = { SETTINGS: fakeKv(store), ...STORAGE_ENV };
  const photos = (await import('../../functions/api/clean/[token]/photos.ts')) as unknown as Record<string, RouteHandler>;
  // 5 MB of base64, over the 4 MB cap.
  const big = Buffer.alloc(5 * 1024 * 1024, 1).toString('base64');
  const res = await photos.onRequestPost!({
    request: new Request(`https://x/api/clean/${token}/photos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ house: 'river', checkout, contentType: 'image/jpeg', base64: big }),
    }),
    env,
    params: { token },
  });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { error: string };
  assert.match(body.error, /under 4 MB/);
});

test('a photo read refuses a path this app would not have written', async () => {
  const store: Store = new Map();
  const { token } = await mint(store);
  const env = { SETTINGS: fakeKv(store), ...STORAGE_ENV };
  const photo = (await import('../../functions/api/clean/[token]/photo.ts')) as unknown as Record<string, RouteHandler>;

  for (const path of [
    'receipts/river/2026-11-14/abc123.jpg',
    'clean-photos/../../etc/passwd',
    'clean-photos/river/2026-13-01/abc123.jpg',
    'clean-photos/river/2026-11-14/abc123.exe',
  ]) {
    const res = await photo.onRequestGet!({
      request: new Request(`https://x/api/clean/${token}/photo?path=${encodeURIComponent(path)}`),
      env,
      params: { token },
    });
    assert.equal(res.status, 400, `path was not refused: ${path}`);
  }
});

test('a delete refuses a path that is not ours', async () => {
  const store: Store = new Map();
  const { token } = await mint(store);
  const env = { SETTINGS: fakeKv(store), ...STORAGE_ENV };
  const photos = (await import('../../functions/api/clean/[token]/photos.ts')) as unknown as Record<string, RouteHandler>;
  const res = await photos.onRequestDelete!({
    request: new Request(`https://x/api/clean/${token}/photos?path=${encodeURIComponent('receipts/x.jpg')}`, { method: 'DELETE' }),
    env,
    params: { token },
  });
  assert.equal(res.status, 400);
});
