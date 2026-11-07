/**
 * The house rules a guest receives were frozen.
 *
 * `propertyConfig` was readable and writable in the store, and the check-in draft and the cleaner
 * notice were built from it — but **no route ever wrote it**, so `houseRules` and the lock-code line a
 * guest is told were permanently the hardcoded defaults. A host had no way to change what their own
 * guest was sent, which is both a product gap and a liability one: house rules are the terms of stay.
 *
 * These tests cover the route and the reachability, because "the store can do it" is not the same as
 * "a host can do it", and that distinction has now been the bug three times on this branch.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { onRequestGet, onRequestPost } from '../../functions/api/operations/config.ts';

const PASSWORD = 'test-password';
const cookie = `wpm_auth=${btoa(`wpm:${PASSWORD}`).replace(/=+$/, '')}`;

function envWith(store: Map<string, string>, opts: { failReads?: boolean } = {}) {
  return {
    SETTINGS: {
      get: async (key: string) => {
        if (opts.failReads) throw new Error('KV GET limit exceeded');
        return store.get(key) ?? null;
      },
      put: async (key: string, value: string) => {
        store.set(key, value);
      },
    },
    DASHBOARD_PASSWORD: PASSWORD,
  } as never;
}

function post(store: Map<string, string>, body: unknown, withCookie = true) {
  return onRequestPost!({
    request: new Request('https://x/api/operations/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(withCookie ? { Cookie: cookie } : {}) },
      body: JSON.stringify(body),
    }),
    env: envWith(store),
    params: {},
  } as never);
}

async function get(store: Map<string, string>) {
  const res = await onRequestGet!({
    request: new Request('https://x/api/operations/config', { headers: { Cookie: cookie } }),
    env: envWith(store),
    params: {},
  } as never);
  return (await res.json()) as { config: Record<string, { houseRules?: string; lockCodeTemplate?: string }> };
}

test('a host can change the house rules a guest is told', async () => {
  const store = new Map<string, string>();
  const before = await get(store);
  const original = before.config.ranch!.houseRules;
  assert.ok(original, 'the default ranch rules are missing');

  const res = await post(store, { house: 'ranch', houseRules: 'Absolute quiet after 9pm.' });
  assert.equal(res.status, 200);
  const after = await get(store);
  assert.equal(after.config.ranch!.houseRules, 'Absolute quiet after 9pm.');
});

test('saving one house does not touch another house', async () => {
  /*
   * The store merges the saved config over the defaults, so a save that replaced the whole object
   * would wipe every other house's rules — and those rules are already going out with check-ins.
   */
  const store = new Map<string, string>();
  const before = await get(store);
  const riverLock = before.config.river!.lockCodeTemplate;
  const lindonRules = before.config.lindon!.houseRules;

  await post(store, { house: 'ranch', houseRules: 'No fires outside the pit.' });
  const after = await get(store);
  assert.equal(after.config.river!.lockCodeTemplate, riverLock, 'the River check-in line changed');
  assert.equal(after.config.lindon!.houseRules, lindonRules, 'the Lindon rules changed');
});

test('a save with nothing in it is refused, not saved as blank', async () => {
  // An empty patch applied as a replace is how a guest's rules become an empty string.
  const store = new Map<string, string>();
  const before = await get(store);
  const res = await post(store, { house: 'ranch' });
  assert.equal(res.status, 400);
  const after = await get(store);
  assert.equal(after.config.ranch!.houseRules, before.config.ranch!.houseRules);
});

test('a bad cleaner email is refused rather than stored', async () => {
  // A malformed address fails silently at send time, so it must not be saved at all.
  const store = new Map<string, string>();
  const res = await post(store, { house: 'river', cleanerEmail: 'not-an-email' });
  assert.equal(res.status, 400);
});

test('a save over an unreadable config is refused', async () => {
  /*
   * The route merges over the current config. If that read fails and returns a default, the merge
   * would write defaults over every house — so a failed read has to stop the save.
   */
  const store = new Map<string, string>();
  const res = await onRequestPost!({
    request: new Request('https://x/api/operations/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ house: 'ranch', houseRules: 'New rules.' }),
    }),
    env: envWith(store, { failReads: true }),
    params: {},
  } as never);
  assert.equal(res.status, 503);
  assert.equal(store.has('propertyConfig'), false, 'a save was written over an unreadable config');
});

test('the route is host-only', async () => {
  const store = new Map<string, string>();
  const res = await post(store, { house: 'ranch', houseRules: 'x' }, false);
  assert.equal(res.status, 401);
});

test('the house settings are reachable from a page a host opens', () => {
  /*
   * This is the part that was missing. The store and the drafts used the config; no screen wrote it.
   * A capability nothing can reach is not a capability, and a test that only calls the store would
   * pass while a host still had no way in.
   */
  const overview = readFileSync(join(process.cwd(), 'src', 'components', 'PortfolioOverview.tsx'), 'utf8');
  // The mount, not the import: an import line still names the component when it is never rendered,
  // so checking for the name alone passed while the panel was unmounted.
  assert.match(
    overview,
    /<TodayDeskWithSettings\b/,
    'the overview does not mount the settings panel',
  );

  const desk = readFileSync(join(process.cwd(), 'src', 'components', 'TodayDesk.tsx'), 'utf8');
  assert.match(desk, /<HouseSettings \/>/, 'the desk does not render the settings panel');

  const api = readFileSync(join(process.cwd(), 'src', 'lib', 'api.ts'), 'utf8');
  assert.match(api, /getHouseSettings:/, 'there is no client call to read the settings');
  assert.match(api, /saveHouseSettings:/, 'there is no client call to save the settings');
});
