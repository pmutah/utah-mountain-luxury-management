/**
 * A cleaner's link is a credential for one list of houses, not for the whole photo store.
 *
 * `GET /api/clean/:token/photo` checked only that the path *looked* like one this app would write.
 * `isCleanPhotoPath` accepts any house, so a cleaner holding a valid link could ask for another
 * house's photo; the only thing in the way was an unguessable filename. A guard should not rest on
 * that â€” the house in the path has to be on the cleaner's own list.
 *
 * The same file also shipped a mojibake apostrophe for a moment, so these tests check the wording is
 * plain ASCII too: a stray byte in an error string reaches the guest's screen.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { onRequestGet } from '../../functions/api/clean/[token]/photo.ts';
import { createCleanLink } from '../../functions/_lib/clean-link-store.ts';

const RANCH_STAY = {
  id: 'res-1',
  propertyId: 'ranch',
  checkIn: '2026-11-05',
  checkOut: '2026-11-07',
  guestName: 'A',
  status: 'confirmed',
};

function envWith(stays: unknown[]) {
  const store: Record<string, string> = { reservations: JSON.stringify(stays) };
  return {
    SETTINGS: {
      get: async (key: string) => store[key] ?? null,
      put: async (key: string, value: string) => {
        store[key] = value;
      },
    },
  } as never;
}

async function ask(env: never, token: string, path: string) {
  const res = await onRequestGet!({
    request: new Request(`https://x/api/clean/${token}/photo?path=${encodeURIComponent(path)}`),
    env,
    params: { token },
  } as never);
  return { status: res.status, body: await res.text() };
}

test('a cleaner cannot read a photo from a house that is not on their list', async () => {
  const env = envWith([RANCH_STAY]);
  const link = await createCleanLink(env, 'Maria');

  const river = await ask(env, link.token, 'clean-photos/river/2026-11-07/abc123def.jpg');
  assert.equal(river.status, 404, 'a River photo was readable from a Ranch-only list');
  assert.match(river.body, /not on this list/i);

  // And the house that is on the list still gets past the scope check. Storage is not configured in
  // this test, so the next gate answers 503 â€” which proves the scope check let it through.
  const ranch = await ask(env, link.token, 'clean-photos/ranch/2026-11-07/abc123def.jpg');
  assert.equal(ranch.status, 503, 'the cleaner could not reach a photo from their own list');
});

test('a bad or unknown link is refused before any scope question', async () => {
  const env = envWith([RANCH_STAY]);
  const bad = await ask(env, 'not-a-token', 'clean-photos/ranch/2026-11-07/abc123def.jpg');
  assert.equal(bad.status, 404);

  // A well-formed token that was never minted must not be treated as a valid cleaner.
  const unknown = await ask(env, 'abcdefghijklmnopqrstuvwx', 'clean-photos/ranch/2026-11-07/abc123def.jpg');
  assert.equal(unknown.status, 404);
});

test('a path outside the photo folder is refused, whatever the token', async () => {
  const env = envWith([RANCH_STAY]);
  const link = await createCleanLink(env, 'Maria');
  for (const path of [
    'receipts/2026/x.pdf',
    'clean-photos/../receipts/a.jpg',
    'clean-photos/ranch/2026-11-07/../../x.jpg',
  ]) {
    const res = await ask(env, link.token, path);
    assert.equal(res.status, 400, `${path} was not refused as a bad path`);
  }
});

test('the cleaner photo route reads the same turnover list as the listing', () => {
  /*
   * If the read used a different window than the listing, a photo the listing showed could be refused
   * here â€” or worse, a photo it never showed could be allowed.
   */
  const read = readFileSync(join(process.cwd(), 'functions', 'api', 'clean', '[token]', 'photo.ts'), 'utf8');
  const list = readFileSync(join(process.cwd(), 'functions', 'api', 'clean', '[token]', 'photos.ts'), 'utf8');
  for (const source of [read, list]) {
    assert.match(source, /buildTurnovers\(/, 'a photo route does not read the turnover list');
    assert.match(source, /denverToday\(/, 'a photo route uses a different clock');
    assert.match(source, /, 14\)/, 'a photo route uses a different window than the two weeks shown');
  }
});

test('an error string a guest reads is plain ASCII', () => {
  // A mis-encoded apostrophe reaches the screen as `cleanerÃ¢â‚¬â„¢s`.
  const read = readFileSync(join(process.cwd(), 'functions', 'api', 'clean', '[token]', 'photo.ts'), 'utf8');
  const strings = read.match(/'[^']*'|`[^`]*`/g) ?? [];
  for (const text of strings) {
    assert.equal(
      /[\u0080-\u00ff]/.test(text),
      false,
      `a non-ASCII character reached a user-facing string: ${text.slice(0, 60)}`,
    );
  }
});

