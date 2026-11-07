/**
 * A failed read of the sent-message log made a duplicate email possible.
 *
 * `sentFor` caught every error and returned `[]`, which to the guard means "nothing has ever been sent
 * to this stay". So a KV read limit or a corrupt value turned a message that had already gone out into
 * one that appeared to be a first send, and the guest got the same week-before email twice.
 *
 * The distinction is the one that has mattered repeatedly on this branch: a failed read is not an
 * empty result. Here the cost is a duplicate email to a real guest, so the route refuses instead.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { canSendMessage } from './stay-message-send.ts';
import { onRequestGet, onRequestPost } from '../../functions/api/stay-guide/[token]/stay-message.ts';

const PASSWORD = 'test-password';
const cookie = `wpm_auth=${btoa(`wpm:${PASSWORD}`).replace(/=+$/, '')}`;

const SURVEY = {
  token: 'tok-abc',
  reservationId: 'res-1',
  propertyId: 'river',
  checkIn: '2027-03-01',
  checkOut: '2027-03-05',
};

/** A KV where the sent-message log read can be made to fail or return junk. */
function envWithLog(log: { fail?: boolean; value?: string } = {}) {
  const store: Record<string, string> = {
    guestSurveys: JSON.stringify([SURVEY]),
    guestGuides: JSON.stringify({ river: { enabled: true } }),
  };
  return {
    store,
    env: {
      DASHBOARD_PASSWORD: PASSWORD,
      SETTINGS: {
        get: async (key: string) => {
          if (key === 'stayMessageLog') {
            if (log.fail) throw new Error('KV GET failed: 429 limit exceeded');
            return log.value ?? null;
          }
          return store[key] ?? null;
        },
        put: async (key: string, value: string) => {
          store[key] = value;
        },
      },
    } as never,
  };
}

function post(env: never) {
  return onRequestPost!({
    request: new Request('https://x/api/stay-guide/tok-abc/stay-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ id: 'week', to: 'guest@example.com' }),
    }),
    env,
    params: { token: 'tok-abc' },
  } as never);
}

test('the guard treats an already-sent message as a duplicate', () => {
  // The baseline the whole fix rests on: the guard does refuse a repeat when it is told about one.
  const base = { house: 'river' as const, checkIn: SURVEY.checkIn, checkOut: SURVEY.checkOut, id: 'week', asOf: '2027-02-22' };
  assert.equal(canSendMessage(base).ok, true);
  const again = canSendMessage({ ...base, alreadySent: ['week'] });
  assert.equal(again.ok, false);
});

test('a log that cannot be read refuses the send instead of repeating it', async () => {
  /*
   * This is the bug: the old code returned `[]` here, the guard saw a clean slate, and the email went
   * out a second time.
   */
  const { env } = envWithLog({ fail: true });
  const res = await post(env);
  assert.equal(res.status, 503, 'a send was attempted without knowing what was already sent');
  const body = (await res.json()) as { error: string };
  assert.match(body.error, /log could not be read/i);
  assert.match(body.error, /nothing was sent/i);
});

test('a corrupt log is not treated as a clean slate either', async () => {
  const { env } = envWithLog({ value: '[{bad json' });
  const res = await post(env);
  assert.equal(res.status, 503, 'a corrupt log was read as "nothing sent yet"');
});

test('the read view refuses too, so the desk is not told a message is ready', async () => {
  // If the GET said "ready to send" on an unreadable log, the host would click and send a duplicate.
  const { env } = envWithLog({ fail: true });
  const res = await onRequestGet!({
    request: new Request('https://x/api/stay-guide/tok-abc/stay-message', { headers: { Cookie: cookie } }),
    env,
    params: { token: 'tok-abc' },
  } as never);
  assert.equal(res.status, 503);
});

test('an empty log still shows what can be sent, because that is a real answer', async () => {
  // The fix must not block normal use: no log written yet genuinely means nothing has been sent.
  const { env } = envWithLog();
  const res = await onRequestGet!({
    request: new Request('https://x/api/stay-guide/tok-abc/stay-message', { headers: { Cookie: cookie } }),
    env,
    params: { token: 'tok-abc' },
  } as never);
  assert.equal(res.status, 200, 'an unwritten log was treated as unreadable');
});

