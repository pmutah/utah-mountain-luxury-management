import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

/*
 * `/book` and `/houses` both 308'd to `/` — the dashboard root — instead of to their own page.
 *
 * The cause was the rule shape: `/book /index.html 200` is a rewrite, and Cloudflare normalises an extensionless path
 * that has no file behind it to a directory, so the rewrite landed on the root. A link sent as
 * `wilhite-portfolio.pages.dev/book` took the guest to the management app's front door.
 *
 * These guards hold the two public entry points to a redirect that keeps the slug, and keep the rewrites for the pages
 * that sit under them.
 */

const RAW = readFileSync(new URL('../../public/_redirects', import.meta.url), 'utf8');
const RULES = RAW.split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line.length > 0 && !line.startsWith('#'))
  .map((line) => {
    const [from, to, status] = line.split(/\s+/);
    return { from, to, status };
  });

function rule(from: string) {
  return RULES.find((row) => row.from === from) ?? null;
}

test('the bare booking path redirects to its own page, not to the root', () => {
  const row = rule('/book');
  assert.ok(row, '/book has no rule at all');
  assert.notEqual(row.to, '/index.html', '/book is a rewrite again, which normalises to the root');
  assert.equal(row.to, '/book/', '/book does not land on the booking page');
  assert.equal(row.status, '301', '/book is not a redirect');
});

test('the bare houses path redirects to its own page, not to the root', () => {
  const row = rule('/houses');
  assert.ok(row, '/houses has no rule at all');
  assert.notEqual(row.to, '/index.html', '/houses is a rewrite again');
  assert.equal(row.to, '/houses/', '/houses does not land on the houses page');
});

test('the pages under those prefixes are still served by the app', () => {
  for (const from of ['/book/*', '/houses/*']) {
    const row = rule(from);
    assert.ok(row, `${from} lost its rewrite`);
    assert.equal(row.to, '/index.html', `${from} no longer serves the app`);
    assert.equal(row.status, '200', `${from} is not a rewrite`);
  }
});

test('the guest and owner token paths are untouched', () => {
  for (const from of ['/stay/*', '/esign/*']) {
    const row = rule(from);
    assert.ok(row, `${from} lost its rewrite`);
    assert.equal(row.to, '/index.html');
    assert.equal(row.status, '200');
  }
});

test('no rule sends a public page to the root', () => {
  for (const row of RULES) {
    assert.notEqual(
      row.to,
      '/',
      `${row.from} sends a guest to the dashboard root, which is a login screen`,
    );
  }
});
