/**
 * The agent map is what Muse, Amanda, and the browser bots read to know what exists. A stale map is
 * worse than no map: an agent will call a route that no longer behaves as described. These tests
 * pin the map to the real routes.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { AGENT_SITE_MAP } from '../../functions/_lib/agent/site-map.ts';

const apis = AGENT_SITE_MAP.apis as Record<string, string>;
const all = Object.values(apis).join('\n');

test('the map never claims the public guide hands out codes or Wi-Fi', () => {
  const guestApp = apis.guestApp ?? '';
  assert.match(guestApp, /blanked/);
  assert.match(guestApp, /not signed in|host cookie or a bot bearer/);
  // The old wording is what told agents the wrong thing.
  assert.equal(/guest app \(codes, Wi-Fi/.test(guestApp), false);
});

test('the map states the auth rule the routes now enforce', () => {
  assert.match(apis.auth ?? '', /DASHBOARD_PASSWORD/);
  assert.match(apis.auth ?? '', /not-configured/);
  assert.match(apis.auth ?? '', /Bearer MUSE_BOT_SECRET/);
  assert.match(all, /open:true means no password is set/);
});

test('every route added this session is named', () => {
  const expected = [
    '/api/book/requests',
    '/api/book/holds',
    '/api/book/accept',
    '/api/clean/links',
    '/api/clean/progress',
    '/api/owner/links',
    '/api/pricing/snapshots',
    '/api/pricing/comp-set',
    '/api/pricing/push-plan',
    '/api/pricing/shadow-days',
  ];
  for (const route of expected) {
    assert.ok(all.includes(route), `the agent map does not name ${route}`);
  }
});

test('the map does not tell an agent a route sends when it does not', () => {
  assert.match(apis.ratePushPlan ?? '', /no writer/);
  assert.match(apis.ratePushPlan ?? '', /sends:false/);
  // The booking route may email, but it must not claim to charge a card.
  assert.match(apis.publicBook ?? '', /does not charge a card|never charges a card/);
  assert.match(apis.bookingInbox ?? '', /never charges a card/);
});

test('the map still names the routes that were there before', () => {
  for (const route of ['/api/portfolio/metrics', '/api/expenses', '/api/reservations', '/api/agent/map', '/api/stay-guide']) {
    assert.ok(all.includes(route), `the agent map lost ${route}`);
  }
});

test('the map does not carry a secret in plain text', () => {
  const text = JSON.stringify(AGENT_SITE_MAP);
  assert.equal(/\bMUSE_BOT_SECRET=[A-Za-z0-9]/.test(text), false);
  assert.equal(/fixture-wifi-secret-not-real/.test(text), false);
  assert.equal(/\b\d{4,8}\b(?=\s*(?:is|opens)\s*(?:the\s*)?(?:door|code))/i.test(text), false);
});

test('every route is covered by the map, so a whole feature cannot ship undocumented', () => {
  /*
   * The list of documented routes was hand-maintained, so adding a route and forgetting to document
   * it failed nothing — `/api/operations/config` and the older `/api/operations/tasks` both went
   * unlisted while these tests stayed green. A deeper scan found something worse: two entire features,
   * `automation` and the `gmail` integration, were named nowhere in the map at all.
   *
   * A route counts as covered when its own path appears, or a named ancestor does — the map describes
   * `/api/stay-guide` once rather than each token route. What it cannot do is say nothing about a
   * prefix, which is the gap this now catches.
   */
  const ROOT = join(process.cwd(), 'functions', 'api');
  const routes: string[] = [];
  const walk = (dir: string, prefix: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const next = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(next, `${prefix}/${entry.name}`);
        continue;
      }
      if (!entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) continue;
      const bare = entry.name.replace(/\.ts$/, '');
      routes.push(bare === 'index' ? `api${prefix}` : `api${prefix}/${bare}`);
    }
  };
  walk(ROOT, '');

  const uncovered = routes.filter((route) => {
    const segments = route.split('/');
    for (let depth = segments.length; depth >= 2; depth -= 1) {
      if (all.includes(`/${segments.slice(0, depth).join('/')}`)) return false;
    }
    return true;
  });
  assert.deepEqual(uncovered, [], `the agent map says nothing about: ${uncovered.map((r) => `/${r}`).join(', ')}`);
});
