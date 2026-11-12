/**
 * A guest add-on waits on the desk. Marking it does not move the booking and does not send a text.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { postStayRequest } from '../stay-request-client.ts';

type Row = {
  id: string;
  reservation_id: string;
  house: string;
  check_in: string;
  check_out: string;
  kind: string;
  note: string | null;
  status: string;
  created_at: string;
  decided_at: string | null;
};

function memoryDb() {
  const rows: Row[] = [];
  const exec = (sql: string, values: unknown[]) => ({
    bind(...next: unknown[]) {
      return exec(sql, next);
    },
    async all() {
      if (sql.includes("status = 'waiting'")) {
        const [reservationId, kind] = values;
        return { results: rows.filter((row) => row.reservation_id === reservationId && row.kind === kind && row.status === 'waiting') };
      }
      if (sql.includes('reservation_id = ?')) {
        return { results: rows.filter((row) => row.reservation_id === values[0]) };
      }
      if (sql.includes('WHERE id')) {
        return { results: rows.filter((row) => row.id === values[0]) };
      }
      return { results: [...rows].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)) };
    },
    async run() {
      if (sql.includes('INSERT')) {
        const [id, reservationId, house, checkIn, checkOut, kind, note, created] = values;
        rows.push({
          id: String(id),
          reservation_id: String(reservationId),
          house: String(house),
          check_in: String(checkIn),
          check_out: String(checkOut),
          kind: String(kind),
          note: note == null ? null : String(note),
          status: 'waiting',
          created_at: String(created),
          decided_at: null,
        });
        return;
      }
      if (sql.includes('SET note')) {
        const [note, id] = values;
        const row = rows.find((item) => item.id === id && item.status === 'waiting');
        if (row) row.note = note == null ? null : String(note);
        return;
      }
      const row = sql.includes("status = 'declined'")
        ? rows.find((item) => item.id === values[1] && item.status === 'waiting')
        : rows.find((item) => item.id === values[2] && item.status === 'waiting');
      if (!row) return;
      if (sql.includes("status = 'declined'")) {
        row.status = 'declined';
        row.decided_at = String(values[0]);
      } else {
        row.status = String(values[0]);
        row.decided_at = String(values[1]);
      }
    },
  });
  return {
    rows,
    prepare(sql: string) {
      return exec(sql, []);
    },
  };
}

function settings(seed: Record<string, unknown>) {
  const data = new Map(Object.entries(seed).map(([key, value]) => [key, JSON.stringify(value)]));
  return {
    async get(key: string) {
      return data.has(key) ? data.get(key)! : null;
    },
    async put(key: string, value: string) {
      data.set(key, value);
    },
  };
}

const stay = {
  reservationId: 'stay-1',
  house: 'ranch' as const,
  checkIn: '2026-11-25',
  checkOut: '2026-11-28',
};

test('a request waits, a second mark is refused, and an owner does not see Lindon', async () => {
  const { cleanStayNote, setStayRequest, decideStayRequest, listStayRequests, stayRequestLine, visibleStayRequests } = await import(
    '../../../functions/_lib/platform/stay-request-store.ts'
  );
  const phone = cleanStayNote('Call 801-787-4722');
  assert.equal(phone.ok, false);
  const note = cleanStayNote('milk, eggs, coffee');
  assert.equal(note.ok, true);
  if (!note.ok) return;

  const unbound = await listStayRequests({});
  assert.equal(unbound.ok, false);

  const db = memoryDb();
  const env = { MARKET_DB: db };
  const filed = await setStayRequest(env, '11111111-1111-1111-1111-111111111111', stay, 'early', true, null, new Date('2026-11-12T12:00:00Z'));
  assert.equal(filed.ok, true);
  if (!filed.ok || !filed.item) return;
  assert.equal(filed.item.status, 'waiting');
  assert.match(stayRequestLine(filed.item), /Nothing was charged, nothing was texted, and the booking was not moved/);

  const again = await setStayRequest(env, '22222222-2222-2222-2222-222222222222', stay, 'early', true, null);
  assert.equal(again.ok, true);
  if (!again.ok || !again.item) return;
  assert.equal(again.item.id, filed.item.id);
  assert.equal(db.rows.length, 1, 'turning a request on twice wrote a second row');

  const lindon = await setStayRequest(
    env,
    '33333333-3333-3333-3333-333333333333',
    { ...stay, reservationId: 'stay-2', house: 'lindon' },
    'late',
    true,
    null,
  );
  assert.equal(lindon.ok, true);
  const listed = await listStayRequests(env);
  assert.equal(listed.ok, true);
  if (!listed.ok) return;
  const owner = visibleStayRequests(listed.items, ['ranch', 'river']);
  assert.equal(owner.some((row) => row.house === 'lindon'), false);
  assert.equal(owner.some((row) => row.house === 'ranch'), true);

  const noted = await decideStayRequest(env, filed.item.id, 'noted', new Date('2026-11-12T13:00:00Z'));
  assert.equal(noted.ok, true);
  const second = await decideStayRequest(env, filed.item.id, 'declined', new Date('2026-11-12T14:00:00Z'));
  assert.equal(second.ok, false);
  assert.equal(db.rows.find((row) => row.id === filed.item!.id)?.status, 'noted');
});

test('the stay link files a request without the guest name, and a closed stay is refused', async () => {
  const db = memoryDb();
  const survey = {
    token: 'staytoken',
    reservationId: 'stay-1',
    propertyId: 'ranch',
    guestName: 'Should Not Leak',
    checkIn: '2026-11-25',
    checkOut: '2026-11-28',
    createdAt: '2026-11-01T00:00:00.000Z',
  };
  const reservation = {
    id: 'stay-1',
    propertyId: 'ranch',
    guestName: 'Should Not Leak',
    checkIn: '2026-11-25',
    checkOut: '2026-11-28',
    status: 'confirmed',
    payout: 1,
    source: 'Airbnb',
  };
  const env = {
    MARKET_DB: db,
    MUSE_BOT_SECRET: 'queue-test-secret',
    SETTINGS: settings({
      guestSurveys: [survey],
      reservations: [reservation],
      guestGuides: { ranch: { enabled: true } },
    }),
  };
  const guest = (await import('../../../functions/api/stay-guide/[token]/requests.ts')) as {
    onRequestPost: (ctx: unknown) => Promise<Response>;
    onRequestGet: (ctx: unknown) => Promise<Response>;
  };
  const host = (await import('../../../functions/api/platform/stay-requests.ts')) as {
    onRequestGet: (ctx: unknown) => Promise<Response>;
    onRequestPost: (ctx: unknown) => Promise<Response>;
  };

  const denied = await host.onRequestGet({ request: new Request('https://desk.test/api/platform/stay-requests'), env });
  assert.equal(denied.status, 401);

  const filed = await guest.onRequestPost({
    request: new Request('https://desk.test/api/stay-guide/staytoken/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'groceries', on: true, note: 'milk and coffee' }),
    }),
    env,
    params: { token: 'staytoken' },
  });
  assert.equal(filed.status, 200);
  const created = (await filed.json()) as { sends: boolean; changesBooking: boolean; item: { line: string } };
  assert.equal(created.sends, false);
  assert.equal(created.changesBooking, false);
  assert.equal(JSON.stringify(created).includes('Should Not Leak'), false);
  assert.match(created.item.line, /grocery drop/);
  assert.equal(db.rows.length, 1);

  // A fresh env. Spreading the first one also copies its request cache, which would still say the stay is confirmed.
  const closedEnv = {
    MARKET_DB: db,
    MUSE_BOT_SECRET: env.MUSE_BOT_SECRET,
    SETTINGS: settings({
      guestSurveys: [survey],
      reservations: [{ ...reservation, status: 'cancelled' }],
      guestGuides: { ranch: { enabled: true } },
    }),
  };
  const closed = await guest.onRequestPost({
    request: new Request('https://desk.test/api/stay-guide/staytoken/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'early', on: true }),
    }),
    env: closedEnv,
    params: { token: 'staytoken' },
  });
  assert.equal(closed.status, 410);
  assert.equal(db.rows.length, 1, 'a closed stay still filed a request');

  const headers = { Authorization: 'Bearer queue-test-secret' };
  const listed = await host.onRequestGet({
    request: new Request('https://desk.test/api/platform/stay-requests', { headers }),
    env,
  });
  const list = (await listed.json()) as { stored: boolean; sends: boolean; changesBooking: boolean; items: { id: string; line: string }[] };
  assert.equal(list.stored, true);
  assert.equal(list.sends, false);
  assert.equal(list.changesBooking, false);
  assert.equal(JSON.stringify(list).includes('Should Not Leak'), false);
  assert.equal(list.items.length, 1);

  const marked = await host.onRequestPost({
    request: new Request('https://desk.test/api/platform/stay-requests', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: list.items[0]?.id, decision: 'noted' }),
    }),
    env,
  });
  assert.equal(marked.status, 200);
  const again = await host.onRequestPost({
    request: new Request('https://desk.test/api/platform/stay-requests', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: list.items[0]?.id, decision: 'declined' }),
    }),
    env,
  });
  assert.equal(again.status, 409);
  assert.equal(db.rows[0]?.status, 'noted');

  const guestRoute = readFileSync(join(process.cwd(), 'functions/api/stay-guide/[token]/requests.ts'), 'utf8');
  const hostRoute = readFileSync(join(process.cwd(), 'functions/api/platform/stay-requests.ts'), 'utf8');
  assert.match(hostRoute, /allowedHouses\(/);
  assert.doesNotMatch(`${guestRoute}\n${hostRoute}`, /textHost|twilio|saveCustom|saveSurveys|kvPut/i);
});

test('a page that is not the desk is not described as filed', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => new Response('<!doctype html>', { status: 200 })) as typeof fetch;
  try {
    const line = await postStayRequest('staytoken', 'early', true);
    assert.match(line, /Kept on this phone/);
    assert.equal(line.includes('On the desk'), false);
  } finally {
    globalThis.fetch = original;
  }
});
