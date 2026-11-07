import assert from 'node:assert/strict';
import test from 'node:test';
import { vaultListUnreadable, vaultUnreadLine } from './vault-read.ts';

test('a failed document read is not an empty folder', () => {
  assert.equal(vaultListUnreadable('The dashboard could not load. Storage writes are paused for the rest of the day.'), true);
  assert.equal(vaultListUnreadable('KV get() limit exceeded for the day.'), true);
  assert.equal(vaultListUnreadable('Nothing in this folder yet.'), false);
  const line = vaultUnreadLine();
  assert.match(line, /not using an empty folder/);
  assert.match(line, /does not say whether mail or text is connected/);
  assert.match(line, /Nothing was written over them/);
  assert.match(line, /Nothing is sent/);
  assert.equal(line.includes('$'), false);
  assert.equal(line.includes('@'), false);
});
