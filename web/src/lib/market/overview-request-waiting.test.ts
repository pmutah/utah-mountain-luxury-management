import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { onRequestGet } from '../../../functions/api/book/requests.ts';

/*
 * **A guest request was invisible on the page the host opens every day.**
 *
 * `#/overview` mentioned requests nowhere: no badge, no line, nothing. With email broken — the Gmail secret is
 * invalid, so every request fails to send — a waiting guest could only be found by opening `#/guests` by chance.
 * Measured on production: a request sitting since 14:30 produced **zero** mentions on the overview.
 *
 * This is the last link in the conversion path. The guest's request saves, holds the dates, and now tells the guest
 * the email failed — but if no host ever sees it, the guest waits forever.
 *
 * The overview now surfaces the one-line summary the requests route already writes. Pinned here: the summary really
 * does describe an open request, and the page really does read it.
 */

const SECRET = 'test-bot-secret';

const overview = readFileSync(new URL('../../components/PortfolioOverview.tsx', import.meta.url), 'utf8');

function kv(store: Map<string, string>) {
  return {
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
  };
}

test('the overview reads the pending requests rather than assuming none', () => {
  assert.match(overview, /api\s*\.\s*getBookingRequests\(\)/, 'the overview never asks for requests');
  assert.match(overview, /data-bot="overview-request-waiting"/, 'the overview renders no waiting-request line');
  assert.match(overview, /#\/guests/, 'the line does not link to the page where a request can be answered');
});

test('a failed inbox read renders nothing rather than a reassuring zero', () => {
  /*
   * The rule this codebase keeps relearning: "cannot read" must not look like "none". A dashboard that claims no
   * requests when the inbox was unreadable is the failure mode that loses a booking.
   */
  assert.match(overview, /catch\(\(\) => \{[\s\S]{0,260}?\}\)/, 'the read has no failure path');
  const catchBlock = /\.catch\(\(\) => \{([\s\S]{0,240}?)\}\);/.exec(overview)?.[1] ?? '';
  assert.equal(/setRequestLine\(\{/.test(catchBlock), false, 'a failed read set a request line');
  // And nothing is rendered until a count is known.
  assert.match(overview, /requestLine && \(/, 'the line renders without a known count');
});

test('the requests summary describes a real open request', async () => {
  /*
   * The route's own line, with one saved request and nothing else in the store. It must name the request and must not
   * claim anything was booked.
   */
  const store = new Map<string, string>();
  store.set(
    'booking-requests',
    JSON.stringify([
      {
        id: 'book-test-1',
        propertyId: 'lindon',
        checkIn: '2026-12-06',
        checkOut: '2026-12-09',
        name: 'A Guest',
        email: 'guest@example.com',
        guests: 4,
        createdAt: '2026-11-08T14:30:00.000Z',
      },
    ]),
  );
  const res = await (onRequestGet as unknown as (c: unknown) => Promise<Response>)({
    request: new Request('https://x/api/book/requests', { headers: { Authorization: `Bearer ${SECRET}` } }),
    env: { SETTINGS: kv(store), MUSE_BOT_SECRET: SECRET },
    params: {},
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { rows: Array<{ accepted?: boolean; declined?: boolean }>; summary: string };
  assert.equal(body.rows.length, 1, 'the saved request was not returned');
  assert.equal(Boolean(body.rows[0]!.accepted) || Boolean(body.rows[0]!.declined), false, 'a new request looked answered');
  assert.match(body.summary, /waiting/i, `the summary does not say a request is waiting: ${body.summary}`);
  assert.match(body.summary, /nothing is booked/i, 'the summary implies the request is a booking');
});

