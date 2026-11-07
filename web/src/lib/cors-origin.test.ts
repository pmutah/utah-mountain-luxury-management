/**
 * CORS on a cookie-authenticated API. Reflecting an arbitrary Origin with credentials turned on
 * lets any website read the ledger using the host's session, so the allow-list has to be real.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { allowedOrigin, corsHeaders, corsJson } from '../../functions/_lib/data.ts';

const OWN = 'https://wilhite-portfolio.pages.dev';
const OTHER = 'https://evil.example';

test('our own origins are allowed and a stranger is not', () => {
  const own = new Request('https://x/api/portfolio/metrics', { headers: { Origin: OWN } });
  assert.equal(allowedOrigin(own), OWN);
  const local = new Request('https://x/api/portfolio/metrics', { headers: { Origin: 'http://localhost:5173' } });
  assert.equal(allowedOrigin(local), 'http://localhost:5173');
  const evil = new Request('https://x/api/portfolio/metrics', { headers: { Origin: OTHER } });
  assert.equal(allowedOrigin(evil), 'null');
  const bare = new Request('https://x/api/portfolio/metrics');
  assert.equal(allowedOrigin(bare), OWN);
});

test('a stranger never receives credentials, even though the app uses a cookie', () => {
  const evil = new Request('https://x/api/portfolio/metrics', { headers: { Origin: OTHER } });
  const headers = corsHeaders(evil);
  assert.equal(headers['Access-Control-Allow-Origin'], 'null');
  assert.equal(headers['Access-Control-Allow-Credentials'], undefined);
  assert.equal(headers.Vary, 'Origin');
});

test('our own origin does receive credentials so the dashboard works', () => {
  const own = new Request('https://x/api/portfolio/metrics', { headers: { Origin: OWN } });
  const headers = corsHeaders(own);
  assert.equal(headers['Access-Control-Allow-Origin'], OWN);
  assert.equal(headers['Access-Control-Allow-Credentials'], 'true');
});

test('corsJson carries the same rule and the JSON content type', async () => {
  const evil = new Request('https://x/api/portfolio/metrics', { headers: { Origin: OTHER } });
  const res = corsJson(evil, { ok: true });
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'null');
  assert.equal(res.headers.get('Access-Control-Allow-Credentials'), null);
  assert.equal(res.headers.get('Content-Type'), 'application/json');
  assert.equal(res.headers.get('Vary'), 'Origin');
  const body = (await res.json()) as { ok: boolean };
  assert.equal(body.ok, true);

  const own = new Request('https://x/api/portfolio/metrics', { headers: { Origin: OWN } });
  const ok = corsJson(own, { ok: true });
  assert.equal(ok.headers.get('Access-Control-Allow-Origin'), OWN);
  assert.equal(ok.headers.get('Access-Control-Allow-Credentials'), 'true');
});

test('an extra header does not overwrite the origin rule by accident', () => {
  const evil = new Request('https://x/api/portfolio/metrics', { headers: { Origin: OTHER } });
  const res = corsJson(evil, null, 204, { 'Cache-Control': 'no-store' });
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'null');
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
});
