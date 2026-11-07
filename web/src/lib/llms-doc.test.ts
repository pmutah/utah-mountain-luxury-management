/**
 * `/llms.txt` is the other place an agent learns what exists. A route that is live but not listed is
 * invisible to a bot that reads this file first, so the file is checked against the routes.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const text = readFileSync(join(process.cwd(), 'public', 'llms.txt'), 'utf8');

test('the docs name every state the guest request page can return', async () => {
  /*
   * The page gained a `cancelled` state, and both the site map and llms.txt still listed four. A bot
   * (or a person) reading the doc would think a cancelled stay reads as `expired` — the exact bug that
   * was fixed — so the docs are checked against the real type.
   *
   * The check is on the *sentence that lists the states*, not on the file containing the word: the
   * first version of this test passed while the doc was stale, because "cancelled" appeared somewhere
   * else in the same file.
   */
  const { requestStatusLine } = await import('./request-status.ts');
  const source = readFileSync(join(process.cwd(), 'src', 'lib', 'request-status.ts'), 'utf8');
  const states = [...source.matchAll(/export type RequestStatus =([^;]+);/g)][0]?.[1] ?? '';
  const list = [...states.matchAll(/'([a-z]+)'/g)].map((m) => m[1]!);
  assert.ok(list.length >= 5, `expected at least five states, found ${list.join(', ')}`);
  assert.ok(list.includes('cancelled'), 'the cancelled state is missing from the type');

  const map = readFileSync(join(process.cwd(), 'functions', '_lib', 'agent', 'site-map.ts'), 'utf8');
  const listing = (source: string) => {
    /*
     * The run of states as each doc lists them. The two docs lead in differently ("It answers
     * `waiting`…" versus "…stands: waiting, accepted…"), so this anchors on `waiting` appearing after
     * the route path, which is the sentence that enumerates the states. An earlier version anchored on
     * "It answers" and matched llms.txt but missed the map.
     */
    const routeAt = source.indexOf('/api/book/request/');
    if (routeAt < 0) return '';
    const at = source.indexOf('waiting', routeAt);
    if (at < 0) return '';
    const rest = source.slice(at);
    const end = rest.search(/\.\s/);
    return end < 0 ? rest.slice(0, 300) : rest.slice(0, end);
  };
  for (const state of list) {
    assert.ok(listing(text).includes(state), `llms.txt does not list the "${state}" state where it lists the others`);
    assert.ok(listing(map).includes(state), `the agent map does not list the "${state}" state where it lists the others`);
  }
  // Every state must also produce a line, so none of them renders blank.
  for (const state of list) {
    const line = requestStatusLine({
      status: state as never,
      houses: ['river'],
      checkIn: '2026-12-01',
      checkOut: '2026-12-04',
      nights: 3,
    });
    assert.ok(line.length > 10, `the "${state}" state renders an empty line`);
  }
});

test('every route built for the bots is named in llms.txt', () => {
  const routes = [
    '/api/book/requests',
    '/api/book/holds',
    '/api/book/accept',
    '/api/clean/links',
    '/api/clean/progress',
    '/api/clean/:token',
    '/api/owner/links',
    '/api/owner/:token',
    '/api/pricing/snapshots',
    '/api/pricing/comp-set',
    '/api/pricing/push-plan',
    '/api/pricing/shadow-days',
  ];
  for (const route of routes) {
    assert.ok(text.includes(route), `llms.txt does not name ${route}`);
  }
});

test('llms.txt says the push plan cannot send', () => {
  assert.match(text, /sends:false/);
  assert.match(text, /no writer/);
});

test('llms.txt says a cleaner link carries no door code or rate', () => {
  assert.match(text, /no door code, guest name, or rate/);
});

test('llms.txt states the auth rule rather than the old open default', () => {
  assert.match(text, /DASHBOARD_PASSWORD/);
  assert.match(text, /not-configured/);
  assert.equal(/everyone is the host/i.test(text), false);
});

test('llms.txt carries no live secret', () => {
  assert.equal(/fixture-wifi-secret-not-real/.test(text), false);
  assert.equal(/\bMUSE_BOT_SECRET=[A-Za-z0-9]/.test(text), false);
});
