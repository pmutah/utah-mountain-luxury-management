import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanRoute, cleanRouteForTurns } from './clean-route.ts';

test('Lindon is one trip and the canyon house is another', () => {
  const line = cleanRoute(['river', 'ranch', 'lindon']);
  assert.match(line, /The Ranch House and The Lindon House are both in Lindon/);
  assert.match(line, /The River House is a separate trip up Provo Canyon/);
  assert.match(line, /canyon road can ice up at night/);
  assert.match(line, /Nothing was booked or sent/);
  assert.equal(line.includes('$'), false);
  assert.equal(/door\s*code|password|wi-?fi/i.test(line), false);
  assert.equal(/\bthe house is open\b/i.test(line), false);

  const ranchOnly = cleanRoute(['ranch']);
  assert.match(ranchOnly, /The Ranch House is in Lindon/);
  assert.equal(ranchOnly.includes('Provo Canyon'), false);

  const spanish = cleanRoute(['lindon', 'ranch', 'river'], 'es');
  assert.match(spanish, /Lindon/);
  assert.match(spanish, /cañón de Provo/);
  assert.match(spanish, /No se reservó ni se envió nada/);
  assert.equal(spanish.includes('$'), false);

  const none = cleanRoute([]);
  assert.match(none, /No houses are on this route/);
});

test('a checkout list leaves a house with no checkout off the route', () => {
  const line = cleanRouteForTurns([{ house: 'lindon' }], ['ranch', 'lindon', 'river']);
  assert.match(line, /The Lindon House is in Lindon/);
  assert.equal(line.includes('Ranch'), false);
  assert.equal(line.includes('River'), false);
  assert.match(line, /Nothing was booked or sent/);
  assert.equal(line.includes('$'), false);
  const unread = cleanRouteForTurns(null, ['ranch', 'lindon', 'river']);
  assert.match(unread, /The Ranch House/);
  assert.match(unread, /The River House/);
  const empty = cleanRouteForTurns([], ['ranch', 'lindon', 'river']);
  assert.match(empty, /No houses are on this route/);
});
