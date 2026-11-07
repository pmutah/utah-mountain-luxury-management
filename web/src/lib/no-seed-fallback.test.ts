/**
 * No route may answer with the seed set.
 *
 * `seedReservations()` and `EXPENSES` exist so the product can be seen before a store is connected.
 * Both were once used as a fallback when a store read failed, which is the worst possible use: an
 * unreadable ledger rendered as a complete one, with figures that reconcile, behind a 200. `/api/portfolio/metrics` was
 * fixed and `/api/portfolio/history` still had the fallback, unreachable only because another read in
 * the same route happened to refuse first.
 *
 * This reads the route sources and fails if any of them reaches for the seed set. A route is allowed
 * to refuse; it is never allowed to invent the books.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const API_ROOT = join(process.cwd(), 'functions', 'api');

function routeFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...routeFiles(full));
      continue;
    }
    if (!entry.endsWith('.ts') || entry.startsWith('_')) continue;
    out.push(full);
  }
  return out;
}

test('no route reaches for the seed set', () => {
  const offenders: string[] = [];
  for (const file of routeFiles(API_ROOT)) {
    const rel = relative(API_ROOT, file).replace(/\\/g, '/');
    const text = readFileSync(file, 'utf8');
    if (/\bseedReservations\s*\(/.test(text)) offenders.push(`${rel}: calls seedReservations()`);
    // `EXPENSES` from _lib/data is the seed ledger. Reading `PROPERTIES` from the same module is fine.
    if (/\bEXPENSES\b(?!_)/.test(text) && /from '.*_lib\/data'/.test(text)) {
      offenders.push(`${rel}: imports the seed EXPENSES list`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `These routes could answer with stand-in books instead of refusing a failed read:\n${offenders.join('\n')}`,
  );
});

test('the metrics route refuses rather than substituting, which is the bug this guards', async () => {
  // A live example of the right behaviour, so the rule above is anchored to something real.
  const { onRequestGet } = (await import('../../functions/api/portfolio/metrics.ts')) as unknown as Record<
    string,
    (c: unknown) => Promise<Response>
  >;
  const limited = {
    SETTINGS: {
      async get() {
        throw new Error('KV GET limit exceeded');
      },
      async put() {},
      async list() {
        return { keys: [], list_complete: true };
      },
    },
    DASHBOARD_PASSWORD: 'pw',
  };
  const res = await onRequestGet!({
    request: new Request('https://x/api/portfolio/metrics?month=2026-11', {
      headers: { Cookie: `wpm_auth=${btoa('wpm:pw').replace(/=+$/, '')}` },
    }),
    env: limited,
    params: {},
  });
  assert.equal(res.status, 503);
  const body = (await res.json()) as Record<string, unknown>;
  assert.equal('reservations' in body, false, 'the metrics route returned a stand-in reservation list');
  assert.equal('expenses' in body, false, 'the metrics route returned a stand-in expense list');
});
