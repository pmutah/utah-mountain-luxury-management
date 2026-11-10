import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/*
 * An uncaught throw in a Cloudflare Worker does not become an exception a caller can read. It becomes Cloudflare's own
 * page: `HTTP 503`, `Content-Type: text/plain`, body `error code: 1102`. Measured on production 2026-11-10 -
 * `/api/pricing/push-plan` and `/api/pricing/yield-plan` both returned exactly that, while `/api/market/overview` (the same
 * board, the same stores) returned 200.
 *
 * Two things are wrong with that page, and this test covers both:
 *
 *   1. It names nothing. Not the route, not the error, not the line. `wrangler pages deployment tail` also refused to
 *      attach, so the stack was not reachable from outside at all, and a host reading "1102" cannot tell whether their
 *      prices or bookings are safe.
 *   2. It is indistinguishable from a real platform problem. A bug in this app looked like Cloudflare being down.
 *
 * So the routes that can throw unexpectedly now answer with JSON that names the fault. These guards keep that true, and
 * they keep the boundary from becoming a place where refusals get swallowed.
 */

const GUARD = readFileSync(join(process.cwd(), 'functions', '_lib', 'read-guard.ts'), 'utf8');
const PUSH = readFileSync(join(process.cwd(), 'functions', 'api', 'pricing', 'push-plan.ts'), 'utf8');
const YIELD = readFileSync(join(process.cwd(), 'functions', 'api', 'pricing', 'yield-plan.ts'), 'utf8');

test('an unexpected throw is answered as JSON, not left to the platform', () => {
  assert.match(GUARD, /export function unexpectedResponse/, 'there is no unexpected-throw boundary');
  // JSON, because a text/plain body is what made the platform page unreadable.
  assert.match(GUARD, /'Content-Type': 'application\/json'/, 'the boundary does not answer JSON');
  // The detail has to be the error's own name and message, or it is just another opaque page.
  assert.match(GUARD, /err\.name/, 'the boundary does not name the error type');
  assert.match(GUARD, /err\.message/, 'the boundary does not carry the error message');
  // "Nothing was written" matters here: these are pricing routes a host might retry.
  assert.match(GUARD, /Nothing was written/, 'the boundary does not say whether anything was written');
  assert.match(GUARD, /unexpected: true/, 'the response does not distinguish itself from a refusal');
});

test('the boundary reports a failure rather than hiding it as success', () => {
  // A 2xx here would be the worst outcome: a host would read an empty plan as "nothing to change".
  assert.match(GUARD, /status: 500/, 'an unexpected throw is not reported as a failure status');
  assert.equal(
    /status: 200[\s\S]{0,80}unexpected/.test(GUARD),
    false,
    'the boundary claims success',
  );
});

test('the pricing routes that threw are inside the boundary', () => {
  for (const [label, src] of [
    ['push-plan', PUSH],
    ['yield-plan', YIELD],
  ] as const) {
    assert.match(src, /unexpectedResponse\(/, `${label} has no unexpected-throw boundary`);
    // It must be called from a catch, not used as a normal return.
    assert.match(src, /catch\s*\([^)]*\)\s*\{\s*return unexpectedResponse\(/, `${label} does not call the boundary from a catch`);
  }
});

test('the boundary does not swallow the refusals that already worked', () => {
  /*
   * A paused store has its own 503 with wording a host already understands, and a bad token has its own 401. Wrapping the
   * handler must not turn either into a generic 500 - that would be a regression dressed as a fix.
   */
  assert.match(PUSH, /storageReadPaused\(err\)/, 'push-plan lost its paused-store handling');
  assert.match(PUSH, /storageReads: 'paused'/, 'push-plan no longer reports a paused store');
  assert.match(YIELD, /readOrRefuse\(/, 'yield-plan no longer uses the shared read guard');
  // The auth refusal must stay outside the boundary, so an unauthenticated caller is still told 401.
  const authed = PUSH.indexOf('hostOnly(request, env)');
  const boundary = PUSH.indexOf('unexpectedResponse(request, err');
  assert.ok(authed > 0 && boundary > authed, 'the auth refusal was moved inside the boundary');
});
