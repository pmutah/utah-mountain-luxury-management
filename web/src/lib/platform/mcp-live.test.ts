import assert from 'node:assert/strict';
import test from 'node:test';
import { onRequestGet as mcpGet, onRequestPost as mcpPost } from '../../../functions/api/mcp/index.ts';
import { signSession } from '../../../functions/_lib/email-session.ts';

const PASSWORD = 'pw';
const ADMIN_COOKIE = `wpm_auth=${btoa(`wpm:${PASSWORD}`).replace(/=+$/, '')}`;
const SESSION_SECRET = '0123456789abcdef0123456789abcdef';

function fakeKv(entries: Record<string, unknown> = {}) {
  const map = new Map<string, string>(Object.entries(entries).map(([k, v]) => [k, JSON.stringify(v)]));
  return {
    async get(key: string) {
      return map.get(key) ?? null;
    },
    async put(key: string, value: string) {
      map.set(key, value);
    },
  };
}

test('GET /api/mcp lists all 9 read-only tools and refuses unauthenticated callers', async () => {
  const unauth = await mcpGet({
    request: new Request('https://x/api/mcp'),
    env: { DASHBOARD_PASSWORD: PASSWORD },
    params: {},
  } as never);
  assert.equal(unauth.status, 401);

  const ok = await mcpGet({
    request: new Request('https://x/api/mcp', { headers: { Cookie: ADMIN_COOKIE } }),
    env: { DASHBOARD_PASSWORD: PASSWORD },
    params: {},
  } as never);
  assert.equal(ok.status, 200);
  const body = (await ok.json()) as { tools: Array<{ name: string }>; send: boolean; bulkDelete: boolean };
  assert.equal(body.send, false);
  assert.equal(body.bulkDelete, false);
  assert.deepEqual(
    body.tools.map((t) => t.name),
    [
      'market_overview',
      'top_comps',
      'pricing_run',
      'opportunities',
      'quote_stay',
      'canyon_conditions',
      'upcoming_turnovers',
      'str_tax_summary',
      'integrity_check',
    ],
  );
});

test('POST /api/mcp speaks JSON-RPC 2.0 initialize, tools/list, and tools/call alongside flat REST', async () => {
  const env = { DASHBOARD_PASSWORD: PASSWORD, SETTINGS: fakeKv() };

  const initRes = await mcpPost({
    request: new Request('https://x/api/mcp', {
      method: 'POST',
      headers: { Cookie: ADMIN_COOKIE, 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    }),
    env,
    params: {},
  } as never);
  const initBody = (await initRes.json()) as { jsonrpc: string; id: number; result: { serverInfo: { name: string } } };
  assert.equal(initBody.jsonrpc, '2.0');
  assert.equal(initBody.id, 1);
  assert.equal(initBody.result.serverInfo.name, 'utah-mountain-luxury-mcp');

  const callRes = await mcpPost({
    request: new Request('https://x/api/mcp', {
      method: 'POST',
      headers: { Cookie: ADMIN_COOKIE, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'top_comps', arguments: { house: 'river' } },
      }),
    }),
    env,
    params: {},
  } as never);
  const callBody = (await callRes.json()) as {
    result: { structuredContent: { house: string; houseSleeps: number; send: boolean } };
  };
  assert.equal(callBody.result.structuredContent.house, 'river');
  // Uses real SLEEPS.river (22), not the old hardcoded 12.
  assert.equal(callBody.result.structuredContent.houseSleeps, 22);
  assert.equal(callBody.result.structuredContent.send, false);
});

test('quote_stay prices single-house and 30-guest two-house compound stays against live reservations', async () => {
  const env = {
    DASHBOARD_PASSWORD: PASSWORD,
    SETTINGS: fakeKv({
      reservations: [
        {
          id: 'r-booked',
          guestName: 'Private Guest',
          propertyId: 'ranch',
          checkIn: '2027-02-05',
          checkOut: '2027-02-08',
          payout: 2400,
          source: 'Airbnb',
          status: 'confirmed',
        },
      ],
    }),
  };

  // Single-house open River quote
  const openRiver = await mcpPost({
    request: new Request('https://x/api/mcp', {
      method: 'POST',
      headers: { Cookie: ADMIN_COOKIE, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'quote_stay',
        arguments: { house: 'river', checkIn: '2026-12-04', checkOut: '2026-12-07', guests: 10 },
      }),
    }),
    env,
    params: {},
  } as never);
  const openBody = (await openRiver.json()) as {
    mode: string;
    quote: { ok: boolean; stayTotal: number };
    holdsDates: boolean;
    chargesCard: boolean;
  };
  assert.equal(openBody.mode, 'single-house');
  assert.equal(openBody.quote.ok, true);
  assert.ok(openBody.quote.stayTotal > 0);
  assert.equal(openBody.holdsDates, false);
  assert.equal(openBody.chargesCard, false);

  // 30-guest two-house compound on Dec 4–7 (both open) vs Dec 10–13 (Ranch booked!)
  const openBoth = await mcpPost({
    request: new Request('https://x/api/mcp', {
      method: 'POST',
      headers: { Cookie: ADMIN_COOKIE, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'quote_stay',
        arguments: { house: 'river', checkIn: '2026-12-04', checkOut: '2026-12-07', guests: 30 },
      }),
    }),
    env,
    params: {},
  } as never);
  const bothBody = (await openBoth.json()) as { mode: string; compound: { ok: boolean; total?: number } };
  assert.equal(bothBody.mode, 'two-house-compound');
  assert.equal(bothBody.compound.ok, true);

  const blockedBoth = await mcpPost({
    request: new Request('https://x/api/mcp', {
      method: 'POST',
      headers: { Cookie: ADMIN_COOKIE, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'quote_stay',
        arguments: { house: 'river', checkIn: '2027-02-05', checkOut: '2027-02-08', guests: 30 },
      }),
    }),
    env,
    params: {},
  } as never);
  const blockedBody = (await blockedBoth.json()) as { compound: { ok: boolean; reason?: string } };
  assert.equal(blockedBody.compound.ok, false);
  assert.match(blockedBody.compound.reason ?? '', /Ranch:/);
});

test('owner role sessions cannot read Lindon via MCP tools, and 2025 Campbell tax locks hold', async () => {
  const ownerToken = await signSession('todd@example.com', SESSION_SECRET, Date.now());
  const ownerCookie = `wpm_auth=${ownerToken}`;
  const env = {
    DASHBOARD_PASSWORD: PASSWORD,
    SESSION_SECRET,
    ALLOWED_EMAILS: 'todd@example.com',
    ROLE_EMAILS: 'owner=todd@example.com',
    SETTINGS: fakeKv({
      reservations: [
        {
          id: 'lin-1',
          guestName: 'Lindon Guest',
          propertyId: 'lindon',
          checkIn: '2026-11-14',
          checkOut: '2026-11-16',
          payout: 600,
          source: 'Airbnb',
          status: 'confirmed',
        },
        {
          id: 'ran-1',
          guestName: 'Ranch Guest',
          propertyId: 'ranch',
          checkIn: '2026-11-14',
          checkOut: '2026-11-16',
          payout: 1800,
          source: 'VRBO',
          status: 'confirmed',
        },
      ],
    }),
  };

  // Direct Lindon query from owner session -> 403
  const forbidden = await mcpPost({
    request: new Request('https://x/api/mcp', {
      method: 'POST',
      headers: { Cookie: ownerCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'top_comps', arguments: { house: 'lindon' } }),
    }),
    env,
    params: {},
  } as never);
  assert.equal(forbidden.status, 403);

  // Turnovers for owner omit Lindon and carry zero guest names
  const turns = await mcpPost({
    request: new Request('https://x/api/mcp', {
      method: 'POST',
      headers: { Cookie: ownerCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'upcoming_turnovers', arguments: {} }),
    }),
    env,
    params: {},
  } as never);
  assert.equal(turns.status, 200);
  const turnsText = await turns.text();
  assert.equal(/Lindon Guest|Ranch Guest/i.test(turnsText), false, 'guest name leaked through upcoming_turnovers');
  const turnsBody = JSON.parse(turnsText) as { turns: Array<{ house: string }> };
  assert.equal(turnsBody.turns.some((t) => t.house === 'lindon'), false, 'Lindon turnover leaked to owner');

  // 2025 tax summary stays locked; 2026 strips Lindon for owner
  const tax2025 = await mcpPost({
    request: new Request('https://x/api/mcp', {
      method: 'POST',
      headers: { Cookie: ownerCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'str_tax_summary', arguments: { year: 2025 } }),
    }),
    env,
    params: {},
  } as never);
  const tax2025Body = (await tax2025.json()) as { locked2025: boolean };
  assert.equal(tax2025Body.locked2025, true);

  const tax2026 = await mcpPost({
    request: new Request('https://x/api/mcp', {
      method: 'POST',
      headers: { Cookie: ownerCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'str_tax_summary', arguments: { year: 2026 } }),
    }),
    env,
    params: {},
  } as never);
  const tax2026Body = (await tax2026.json()) as { properties: Array<{ propertyId: string }> };
  assert.equal(tax2026Body.properties.some((p) => p.propertyId === 'lindon'), false, 'Lindon tax column leaked to owner');
});
