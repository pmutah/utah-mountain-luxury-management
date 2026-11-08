import assert from 'node:assert/strict';
import test from 'node:test';
import { toolResultForModel } from '../../../functions/_lib/agent/run-agent.ts';

/*
 * **A tool result was cut at 2000 characters, and the model could not tell.**
 *
 * Found while verifying the approved-rate fix: asked what to charge for a Lindon night the host had approved at
 * $193, the co-host answered "$527 Airbnb, and a 20% promotion." The tool *did* return $193 with `approved: true`
 * — but the result went to the model through `JSON.stringify(toolOut).slice(0, 2000)`, so a long pricing answer was
 * silently truncated and the model filled the gap from the doctrine formula.
 *
 * This is the same defect class as every other one this session: a label with nothing behind it. A truncated array
 * looks exactly like a short one, so there is nothing for the model to notice.
 */

test('a result inside the budget is sent whole, byte for byte', () => {
  const out = { propertyId: 'lindon', nights: [{ date: '2026-12-09', listingHostNightly: 193, approved: true }] };
  const sent = toolResultForModel(out);
  assert.equal(sent, JSON.stringify(out), 'a small result was altered');
  assert.equal(JSON.parse(sent).nights[0].approved, true);
});

test('a result over the budget says it was shortened instead of being cut', () => {
  /*
   * The exact failure: a long night list. The old code cut mid-array, so the last nights vanished with no signal.
   */
  const nights = Array.from({ length: 400 }, (_, index) => ({
    date: `2026-12-${String((index % 28) + 1).padStart(2, '0')}`,
    listingHostNightly: 193,
    approved: true,
  }));
  const out = { propertyId: 'lindon', nights, why: 'a long explanation' };
  const sent = toolResultForModel(out);

  assert.ok(sent.includes('too large to send in full'), 'an oversized result was cut silently');
  assert.ok(sent.includes('400 items'), 'the count was not reported');
  assert.ok(sent.includes('narrower date range'), 'the model was not told what to do about it');
  // The important half: it must be honest that the list is missing, not merely shorter.
  assert.equal(sent.includes('"listingHostNightly":193'), false, 'a partial list was passed off as the whole');
  // And it must still be parseable, so a model reading it does not choke.
  const [json] = sent.split('\n\n');
  assert.doesNotThrow(() => JSON.parse(json!), 'the shortened result is not valid JSON');
});

test('a scalar-only result is never shortened, because there is nothing to drop', () => {
  const out = { propertyId: 'ranch', openNightCount: 12, from: '2026-12-01', to: '2026-12-14' };
  assert.equal(toolResultForModel(out), JSON.stringify(out));
});
