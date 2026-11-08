import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolveCleanLink } from '../../../functions/_lib/clean-auth.ts';
import { onRequestGet } from '../../../functions/api/clean/[token].ts';

/*
 * **A cleaner's link failed three times out of four, and the page said the link was bad.**
 *
 * Measured on production on a token minted seconds earlier, eight identical reads:
 *
 *     404, 404, 404, 200, 404, 200, 404, 404
 *
 * The cause was `.catch(() => null)` on every cleaner route. `kvGet` throws when a read fails — deliberately, so a
 * caller can never mistake a failed read for an absent key — and the catch turned every one of those throws into
 * "This clean link is not valid."
 *
 * That is worse than an outage. A person told their credential is invalid stops trying, and does not trust the page
 * when it works again. And a cleaner reads this standing in a driveway, on a phone, about to let themselves into a
 * guest's house.
 *
 * The rules pinned here: a failed read is **503 with a sentence saying it is not a bad link**, a genuinely unknown
 * token is **404**, and the two are never conflated.
 */

const SECRET = 'test-bot-secret';

function env(handler: () => Promise<string | null>) {
  return {
    SETTINGS: { get: handler, put: async () => undefined },
    MUSE_BOT_SECRET: SECRET,
  } as never;
}

const ctx = (path: string) => ({
  request: new Request(`https://x${path}`),
  env: null as unknown,
  params: {} as Record<string, string>,
});

test('a failed read is a 503 that says the link is not bad', async () => {
  const resolved = await resolveCleanLink(
    env(async () => {
      throw new Error('KV GET limit exceeded');
    }),
    'a'.repeat(32),
    new Request('https://x/clean/x'),
  );
  assert.ok('response' in resolved, 'a failed read was treated as a resolved link');
  const res = (resolved as { response: Response }).response;
  assert.equal(res.status, 503, 'a storage failure was reported as a bad link');
  const body = (await res.json()) as { error: string; storageReads?: string };
  assert.match(body.error, /not a bad link/i, 'the guest is not told the difference');
  assert.match(body.error, /try again/i, 'the guest is not told what to do');
  assert.equal(body.storageReads, 'paused', 'the read-limited case is not marked for the desk');
});

test('an unknown token is still a 404, with no confusion', async () => {
  // The other direction. A real bad link must not be softened into "try again" forever.
  const resolved = await resolveCleanLink(env(async () => JSON.stringify([])), 'b'.repeat(32), new Request('https://x/clean/x'));
  assert.ok('response' in resolved);
  assert.equal((resolved as { response: Response }).response.status, 404);
});

test('a known token resolves to the link', async () => {
  const token = 'c'.repeat(32);
  const stored = JSON.stringify([{ token, label: 'A cleaner', createdAt: '2026-11-08T00:00:00.000Z' }]);
  const resolved = await resolveCleanLink(env(async () => stored), token, new Request('https://x/clean/x'));
  assert.ok('link' in resolved, 'a valid token was refused');
  assert.equal((resolved as { link: { token: string } }).link.token, token);
});

test('the parent route keeps the two cases apart as well', async () => {
  /*
   * The token route had its own correct handling before this change; the photos routes did not. This checks the token
   * route has not regressed while the swallow was being removed elsewhere.
   *
   * `params.token` must be supplied — an empty one fails the hex-shape check and 404s before the store is ever
   * reached, which is a different (correct) path and would make this test pass for the wrong reason.
   */
  const token = 'd'.repeat(32);
  const failing = {
    request: new Request(`https://x/api/clean/${token}`),
    env: env(async () => {
      throw new Error('KV GET limit exceeded');
    }),
    params: { token },
  };
  const res = await (onRequestGet as unknown as (c: typeof failing) => Promise<Response>)(failing);
  assert.equal(res.status, 503, 'a failed read on the token route became a 404');
  const body = (await res.json()) as { error: string };
  assert.match(body.error, /not a bad link/i);
});

test('no cleaner route swallows a read into a bad-link answer', () => {
  // The structural guard: the pattern that caused this must not come back in any cleaner surface.
  const files = [
    '../../../functions/api/clean/[token].ts',
    '../../../functions/api/clean/[token]/photos.ts',
    '../../../functions/api/clean/[token]/photo.ts',
  ];
  for (const file of files) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.equal(
      /findCleanLink\([^)]*\)\.catch\(\(\) => null\)/.test(source),
      false,
      `${file} swallows a failed read into "not valid" again`,
    );
  }
});



