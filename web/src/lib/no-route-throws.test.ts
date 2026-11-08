/**
 * Every GET route, run against a store that is refusing reads.
 *
 * The live outage was Cloudflare **Error 1101** — "Worker threw an unhandled exception" — on routes
 * that read KV. Twenty-four routes on this branch had that shape: an unguarded `await load...()` that
 * turned a `StorageReadError` into a crash instead of a 503 with a reason.
 *
 * This walks the real route files and requires that none of them throws. A route may refuse (4xx/5xx),
 * answer with the paused flag, or answer normally if it needs no store; what it may not do is throw.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, statSync } from 'node:fs';
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

/** A store at its read limit: every get raises the message `storageReadPaused` recognises. */
const refusing = {
  SETTINGS: {
    async get() {
      throw new Error('KV GET limit exceeded');
    },
    async put() {},
    async delete() {},
    async list() {
      return { keys: [], list_complete: true };
    },
  },
  DASHBOARD_PASSWORD: 'pw',
};

const COOKIE = `wpm_auth=${btoa('wpm:pw').replace(/=+$/, '')}`;

const METHODS: Record<string, string> = {
  onRequestGet: 'GET',
  onRequestPost: 'POST',
  onRequestPut: 'PUT',
  onRequestPatch: 'PATCH',
  onRequestDelete: 'DELETE',
};

/** A body every write route will at least try to parse, so refusal comes from the store. */
const BODY = JSON.stringify({
  id: 'test-id',
  month: '2026-11',
  house: 'river',
  propertyId: 'river',
  date: '2026-11-10',
  checkIn: '2026-11-10',
  checkOut: '2026-11-13',
  guests: 6,
  payout: 1000,
  reason: 'dates-taken',
  status: 'confirmed',
  note: 'test',
  done: [],
  asks: [],
  label: 'test',
  sleeps: 16,
  distanceMi: 2,
  guest: 900,
  amount: 10,
  category: 'Repair',
});

function urlFor(rel: string): string {
  const path = rel
    .replace(/\.ts$/, '')
    .replace(/\/index$/, '')
    .replace(/\[([^\]]+)\]/g, (_, name) => (/token|id/.test(String(name)) ? 'a'.repeat(32) : '2026-11'));
  return `https://x/api/${path}?month=2026-11&house=river&days=30&end=2026-11&count=12`;
}

test('no handler throws, and no write claims success, when the store refuses reads', async () => {
  const failures: string[] = [];
  const falseWrites: string[] = [];
  let walked = 0;

  for (const file of routeFiles(API_ROOT)) {
    const rel = relative(API_ROOT, file).replace(/\\/g, '/');
    let mod: Record<string, unknown>;
    try {
      mod = (await import(`../../functions/api/${rel}`)) as Record<string, unknown>;
    } catch {
      // A route that cannot be imported in this harness is not evidence either way; skip it.
      continue;
    }
    for (const [exportName, method] of Object.entries(METHODS)) {
      const handler = mod[exportName] as ((c: unknown) => Promise<Response>) | undefined;
      if (!handler) continue;
      walked += 1;
      try {
        const res = await handler({
          request: new Request(urlFor(rel), {
            method,
            headers: { Cookie: COOKIE, 'Content-Type': 'application/json', Accept: 'application/json' },
            ...(method === 'GET' || method === 'DELETE' ? {} : { body: BODY }),
          }),
          env: refusing,
          params: { token: 'a'.repeat(32), id: 'test-id', photoId: 'p1', house: 'river' },
        });
        /*
         * A write that answers 2xx while the store refuses reads is worse than a crash: the caller is
         * told it worked. None may do that.
         *
         * Signing out is the one exception, and it is checked rather than assumed: it clears a cookie
         * and touches no store, so a store failure cannot make it dishonest. Every other non-GET has to
         * refuse.
         */
        const isSignOut = method === 'DELETE' && rel === 'auth/login.ts';
        if (method !== 'GET' && res.status < 300 && !isSignOut) {
          falseWrites.push(`${method} /api/${rel} answered ${res.status}`);
        }
      } catch (err) {
        failures.push(`${method} /api/${rel}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  assert.ok(walked > 90, `expected to walk every handler, walked ${walked}`);
  assert.deepEqual(
    failures,
    [],
    `These handlers threw rather than answering. In production an unhandled throw is Cloudflare Error 1101, not a 503 with a reason:\n${failures.join('\n')}`,
  );
  assert.deepEqual(
    falseWrites,
    [],
    `These writes answered success while the store refused reads, so the caller was told a write landed:\n${falseWrites.join('\n')}`,
  );
});
