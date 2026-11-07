/**
 * The link an accepted direct guest gets. It has to open a real guest page, not a 404, or the
 * accepted guest is the only guest who cannot read the house guide.
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

test('an accepted direct guest can open the stay page from the link', async () => {
  const store: Store = new Map();
  store.set(
    'booking-requests',
    JSON.stringify([
      {
        id: 'book-1',
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        propertyId: 'river',
        checkIn: '2027-12-01',
        checkOut: '2027-12-04',
        guests: 8,
      },
    ]),
  );
  const env = { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD };
  const accept = (await import('../../functions/api/book/accept.ts')) as unknown as Record<string, RouteHandler>;
  const accepted = await accept.onRequestPost!({
    request: new Request('https://wilhite-portfolio.pages.dev/api/book/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ id: 'book-1', payout: 4200 }),
    }),
    env,
    params: {},
  });
  assert.equal(accepted.status, 201);
  const body = (await accepted.json()) as {
    portalLink: string | null;
    portalError: string | null;
    portalNote: string | null;
    guideOn: boolean;
  };
  assert.equal(body.portalError, null);
  assert.ok(body.portalLink);
  const token = body.portalLink.split('/stay/')[1]!;
  assert.match(token, /^[a-f0-9]{32}$/);

  // The page the link points at is the stay-guide route, and it resolves this token.
  const guide = (await import('../../functions/api/stay-guide/[token]/index.ts')) as unknown as Record<
    string,
    RouteHandler
  >;
  const page = await guide.onRequestGet!({
    request: new Request(`https://wilhite-portfolio.pages.dev/api/stay-guide/${token}`),
    env,
    params: { token },
  });
  // The house app is off until it is turned on, which is a real state and not a broken link.
  assert.ok(page.status === 200 || page.status === 404 || page.status === 503);
  const pageBody = (await page.json()) as { enabled?: boolean; guestName?: string; error?: string };
  assert.equal(pageBody.error === 'This link is not valid.', false);
  if (pageBody.enabled === false) {
    // The link is genuine. The host is told the app is off rather than being left to assume it works.
    assert.equal(body.guideOn, false);
    assert.match(body.portalNote ?? '', /app is off for the River House/);
  } else {
    assert.equal(pageBody.guestName, 'Ada Lovelace');
  }

  // The saved stay carries the token, so the host desk can resend the link later.
  const saved = JSON.parse(store.get('reservations') ?? '[]') as Array<{ surveyToken?: string; guestEmail?: string }>;
  assert.equal(saved[0]!.surveyToken, token);
  assert.equal(saved[0]!.guestEmail, 'ada@example.com');
});
