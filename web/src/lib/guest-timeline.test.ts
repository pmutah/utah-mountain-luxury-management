import assert from 'node:assert/strict';
import test from 'node:test';
import { guestTimeline, readTimelineSwitches, timelineOnCount, TIMELINE_IDS } from './guest-timeline.ts';

test('each house has the full preview and no code, price, or discount', () => {
  for (const house of ['river', 'ranch', 'lindon'] as const) {
    const messages = guestTimeline(house);
    assert.deepEqual(
      messages.map((message) => message.id),
      [...TIMELINE_IDS],
    );
    const text = messages.map((message) => `${message.subject} ${message.body}`).join('\n');
    assert.equal(text.includes('$'), false);
    assert.equal(/code\s*\d|\b\d{4}\b/i.test(text), false);
    assert.match(text, /door code stays off this message/);
    assert.match(text, /does not include the code/);
    assert.match(text, /This is not a discount/);
    assert.match(text, /does not post one/);
    assert.match(text, /4:00 PM/);
    assert.match(text, /11:00 AM/);
  }
  const river = guestTimeline('river').map((message) => message.body).join(' ');
  assert.match(river, /septic/i);
  assert.match(river, /Provo Canyon/);
  const ranch = guestTimeline('ranch').map((message) => message.body).join(' ');
  assert.match(ranch, /Hot tub/);
  assert.equal(/septic/i.test(ranch), false);
  const lindon = guestTimeline('lindon').map((message) => message.body).join(' ');
  assert.equal(/hot tub|septic/i.test(lindon), false);
});

test('a switch stays off only when it was saved off', () => {
  const fresh = readTimelineSwitches(null);
  assert.equal(timelineOnCount(fresh.river), 8);
  const saved = readTimelineSwitches(JSON.stringify({ river: { eve: false, booked: true }, ranch: { leave: false } }));
  assert.equal(saved.river.eve, false);
  assert.equal(saved.river.booked, true);
  assert.equal(saved.ranch.leave, false);
  assert.equal(saved.lindon.review, true);
  assert.equal(timelineOnCount(saved.river), 7);
  assert.equal(readTimelineSwitches('not-json').river.booked, true);
});
