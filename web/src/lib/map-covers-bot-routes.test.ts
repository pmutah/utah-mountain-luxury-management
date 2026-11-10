import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { AGENT_SITE_MAP } from '../../functions/_lib/agent/site-map.ts';
import { botRoutePaths } from '../../functions/_lib/muse/routes.ts';

/*
 * A bot holding a bearer can call **every** `/api/*` route, not only the ones in the OpenAPI registry. The map is the only
 * thing telling an agent what a route does before it calls one.
 *
 * The registry check came first because those routes are advertised. But the bearer reaches the rest too, so an
 * undocumented `/api/expenses/:id/attach-receipt` — which **deletes the bill it replaces** — was reachable and unreadable.
 * Fourteen route files were in that state.
 *
 * So the guard now walks the filesystem. A new route file with no line in the map fails this test by name, which is the
 * point: the map is not allowed to fall behind the routes it describes.
 */

const APIs = AGENT_SITE_MAP.apis as Record<string, string>;
const MAP_TEXT = Object.values(APIs).join('\n');
const ROUTE_ROOT = 'functions/api';

/** Every route pattern the filesystem serves, in the `:param` form the map uses. */
function routeFiles(dir = ROUTE_ROOT, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      routeFiles(full, out);
    } else if (/\.(ts|js)$/.test(entry.name)) {
      const route = full
        .replace(/\\/g, '/')
        .replace(/^functions/, '')
        .replace(/\.(ts|js)$/, '')
        .replace(/\/index$/, '')
        .replace(/\[([^\]]+)\]/g, ':$1');
      if (route.startsWith('/api/')) out.push(route);
    }
  }
  return out;
}

/**
 * Is this route described anywhere in the map?
 *
 * The map writes a sub-route three ways: the whole path, a compact `:id/send` tail, or the bare last segment when the
 * surrounding sentence already named the parent. A bare-segment hit is weak evidence, so it is only accepted for a route
 * whose parent path is also in the map text.
 */
function described(route: string): boolean {
  if (MAP_TEXT.includes(route)) return true;

  const segs = route.split('/').filter(Boolean);
  const parent = '/' + segs.slice(0, -1).join('/');
  if (segs.length > 2 && MAP_TEXT.includes(parent)) {
    const last = segs[segs.length - 1]!;
    const prev = segs[segs.length - 2]!;
    if (prev.startsWith(':') && MAP_TEXT.includes(`${prev}/${last}`)) return true;
    // The tail mentions this file's own segment, e.g. "POST /reanalyze".
    if (new RegExp(`/${last}(?![\\w-])`).test(MAP_TEXT)) return true;
  }
  return false;
}

test('every bot-callable route is described in the site map', () => {
  const paths = botRoutePaths();
  assert.ok(paths.length > 10, `only ${paths.length} bot paths — the registry is not being read`);

  const missing = paths.filter((p) => {
    // The registry writes parameters as {braces}; the map writes them as :colons.
    const readable = p.replace(/\{[^}]+\}/g, ':token');
    return !MAP_TEXT.includes(p) && !MAP_TEXT.includes(readable);
  });

  assert.deepEqual(
    missing,
    [],
    `a bot can call these but the map does not describe them:\n  ${missing.join('\n  ')}`,
  );
});

test('every route file is described in the site map, not only the advertised ones', () => {
  const routes = [...new Set(routeFiles())].sort();
  assert.ok(routes.length > 80, `only ${routes.length} route files found — the walk is wrong`);

  const missing = routes.filter((route) => !described(route));
  assert.deepEqual(
    missing,
    [],
    `these routes exist and a bearer can call them, but the map never names them:\n  ${missing.join('\n  ')}`,
  );
});

test('the three routes that were missing are named', () => {
  // Named explicitly as well, so removing one from the map fails here by name rather than only by the generic check.
  assert.match(MAP_TEXT, /\/api\/expenses\/archive/, 'the expense archive is undocumented');
  assert.match(MAP_TEXT, /\/api\/book\/decline/, 'declining a request is undocumented');
  assert.match(MAP_TEXT, /stay-message/, 'sending a stay message is undocumented');
});

test('the archive entry says it is the recovery path and not a total', () => {
  assert.match(APIs.expenseArchive ?? '', /recovery path|way back/, 'the archive does not say what it is for');
  assert.match(APIs.expenseArchive ?? '', /no report, statement, or P&L/, 'the archive does not say those rows are excluded');
});

test('the stay-message entry says nothing is scheduled', () => {
  // The distinction matters: a host reading "sends a message" could assume a schedule exists.
  assert.match(APIs.stayMessage ?? '', /Nothing is scheduled/, 'the stay-message entry does not rule out a schedule');
});

test('the destructive expense routes say what they destroy', () => {
  // These were the two reachable routes that can remove a receipt for good, and neither was in the map.
  assert.match(APIs.expenseReceipt ?? '', /deletes the old file|replaces/i, 'attach-receipt does not say it replaces the old bill');
  assert.match(APIs.expenseReceipt ?? '', /no archive for a photo/i, 'the photo delete does not say it is permanent');
});

test('discard is told apart from decline', () => {
  // A host who reads "clear a request" as "decline it" leaves a guest unanswered, which is the whole risk here.
  assert.match(APIs.requestDiscard ?? '', /mails nobody|without answering/, 'discard does not say it tells the guest nothing');
  assert.match(APIs.requestDiscard ?? '', /decline/, 'discard does not send the reader to decline instead');
});
