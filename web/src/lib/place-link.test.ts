import assert from 'node:assert/strict';
import test from 'node:test';
import { placeHref, placeSite } from './place-link.ts';

test('a published website is kept and a secret link becomes a map', () => {
  assert.equal(placeSite('https://www.sundanceresort.com'), 'sundanceresort.com');
  assert.equal(placeSite('http://example.com'), null);
  assert.equal(placeSite('https://example.com/password'), null);
  assert.equal(placeHref({ name: 'Sundance Mountain Resort', url: 'https://www.sundanceresort.com' }), 'https://www.sundanceresort.com');
  assert.match(placeHref({ name: 'Bridal Veil Falls', area: 'Provo Canyon' }), /google\.com\/maps\/search/);
  assert.equal(placeHref({ name: 'Bridal Veil Falls', url: 'https://example.com/wi-fi' }).includes('example.com'), false);
});
