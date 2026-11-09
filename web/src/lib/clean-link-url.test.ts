import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { cleanLinkPath, cleanLinkUrl, isCleanToken } from './clean-link.ts';

/*
 * The clean desk told a host to "text it to" a cleaner while showing only `/clean/<token>`. That is a path, not an
 * address: a cleaner on a phone cannot open it, so the instruction had nothing behind it.
 *
 * `cleanLinkUrl` builds the address that actually goes in a message, and refuses to build a confident-looking one from a
 * token that is not a real link.
 */

const TOKEN = 'b2d159a291084aef8c2a4705f8794ac4';

test('a real token becomes a full address on the given origin', () => {
  assert.equal(cleanLinkUrl(TOKEN, 'https://wilhite-portfolio.pages.dev'), `https://wilhite-portfolio.pages.dev/clean/${TOKEN}`);
});

test('a trailing slash on the origin does not double up', () => {
  assert.equal(cleanLinkUrl(TOKEN, 'https://example.com/'), `https://example.com/clean/${TOKEN}`);
  assert.equal(cleanLinkUrl(TOKEN, 'https://example.com///'), `https://example.com/clean/${TOKEN}`);
});

test('a token that cannot be a real link yields null rather than a dead address', () => {
  for (const bad of ['', 'short', TOKEN.toUpperCase(), `${TOKEN}extra`, '../etc/passwd']) {
    assert.equal(cleanLinkUrl(bad, 'https://example.com'), null, `built an address from "${bad}"`);
  }
});

test('an origin that is not an http origin yields null', () => {
  for (const bad of ['', '/', 'example.com', 'ftp://example.com', 'javascript:alert(1)', 'https://example.com/path']) {
    assert.equal(cleanLinkUrl(TOKEN, bad), null, `accepted the origin "${bad}"`);
  }
});

test('the path helper still returns a path, so hrefs keep working', () => {
  assert.equal(cleanLinkPath(TOKEN), `/clean/${TOKEN}`);
  assert.equal(isCleanToken(TOKEN), true);
});

test('the panel shows the full address and never only the path', () => {
  const PANEL = readFileSync(new URL('../components/CleanLinkPanel.tsx', import.meta.url), 'utf8');
  assert.match(PANEL, /cleanLinkUrl/, 'the panel stopped building a full address');
  assert.match(PANEL, /data-bot="clean-link-url"/, 'the row has no full-address element');
  // The bare path must not be what the row shows as the link.
  assert.equal(/<span className="break-all">\{link\.path\}<\/span>/.test(PANEL), false, 'the row shows the bare path again');
});

test('the copy action reports a failure instead of pretending it copied', () => {
  const PANEL = readFileSync(new URL('../components/CleanLinkPanel.tsx', import.meta.url), 'utf8');
  assert.match(PANEL, /clean-link-copied/, 'a copy has no outcome message');
  assert.match(PANEL, /Copying was blocked/, 'a blocked copy says nothing');
  assert.match(PANEL, /navigator\.clipboard/, 'the copy path stopped checking for clipboard support');
});

test('the mint message gives the address, not the path', () => {
  const PANEL = readFileSync(new URL('../components/CleanLinkPanel.tsx', import.meta.url), 'utf8');
  assert.match(PANEL, /Ready to text to/, 'the mint message changed shape');
  assert.match(PANEL, /cleanLinkUrl\(created\.token/, 'the mint message builds no full address');
});
