/**
 * The stay phone's door code, end to end. This is the guest portal's whole reason to exist, so the
 * layers are pinned: the window, the phone having read the rules, and the agreement topics.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { stayAccessSecrets, codesReady } from './stay-rules.ts';
import { accessWindow } from '../../functions/_lib/guest-guide.ts';

type Store = Map<string, string>;

function fakeKv(store: Store) {
  return {
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
  };
}

type RouteHandler = (context: { request: Request; env: unknown; params: Record<string, string> }) => Promise<Response>;

const TOKEN = 'e'.repeat(32);

function denverDay(offsetDays = 0) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver' }).format(new Date());
  const day = new Date(`${today}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() + offsetDays);
  return day.toISOString().slice(0, 10);
}

function seed(store: Store, checkIn: string, checkOut: string) {
  store.set(
    'guestSurveys',
    JSON.stringify([
      {
        token: TOKEN,
        reservationId: 'test-stay-1',
        propertyId: 'river',
        guestName: 'Ada Lovelace',
        checkIn,
        checkOut,
        createdAt: '2026-11-01T00:00:00.000Z',
      },
    ]),
  );
  store.set(
    'guestGuides',
    JSON.stringify({
      river: {
        enabled: true,
        doorCode: '4821',
        wifiName: 'Riverhouse',
        wifiPassword: 'fixture-wifi-secret-not-real',
        doorNotes: 'Lockbox on the left post.',
        headline: 'Sleeps 25 on the Provo River',
      },
    }),
  );
}

async function loadPage(store: Store, ready: boolean) {
  const mod = (await import('../../functions/api/stay-guide/[token]/index.ts')) as unknown as Record<string, RouteHandler>;
  const url = `https://x/api/stay-guide/${TOKEN}${ready ? '?ready=1' : ''}`;
  return mod.onRequestGet!({ request: new Request(url), env: { SETTINGS: fakeKv(store) }, params: { token: TOKEN } });
}

test('a stay far in the future opens nothing, even on a ready phone', async () => {
  const store: Store = new Map();
  seed(store, denverDay(40), denverDay(43));
  const res = await loadPage(store, true);
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.equal(text.includes('4821'), false, 'the door code leaked before the window');
  assert.equal(text.includes('fixture-wifi-secret-not-real'), false, 'the Wi-Fi password leaked before the window');
  const body = JSON.parse(text) as { access: { unlocked: boolean; phase: string; doorCode: string | null } };
  assert.equal(body.access.unlocked, false);
  assert.equal(body.access.phase, 'before');
  assert.equal(body.access.doorCode, null);
});

test('a stay in progress opens the codes only when the phone is ready', async () => {
  const store: Store = new Map();
  seed(store, denverDay(-1), denverDay(2));

  // A fresh phone has not read the rules, so the secrets stay off.
  const cold = await loadPage(store, false);
  const coldBody = (await cold.json()) as { access: { unlocked: boolean; doorCode: string | null } };
  assert.equal(coldBody.access.unlocked, true, 'the window should be open during the stay');
  assert.equal(coldBody.access.doorCode, null, 'a phone that has not read the rules got the code');

  // A ready phone gets them.
  const ready = await loadPage(store, true);
  const readyText = await ready.text();
  const readyBody = JSON.parse(readyText) as { access: { doorCode: string | null; wifiPassword: string | null } };
  assert.equal(readyBody.access.doorCode, '4821');
  assert.equal(readyBody.access.wifiPassword, 'fixture-wifi-secret-not-real');
});

test('a finished stay opens nothing', async () => {
  const store: Store = new Map();
  seed(store, denverDay(-6), denverDay(-3));
  const res = await loadPage(store, true);
  const text = await res.text();
  assert.equal(text.includes('4821'), false);
  const body = JSON.parse(text) as { access: { phase: string; unlocked: boolean } };
  assert.equal(body.access.phase, 'after');
  assert.equal(body.access.unlocked, false);
});

test('the window itself is the day before check-in through noon on checkout day', () => {
  const checkIn = '2026-12-10';
  const checkOut = '2026-12-14';
  const at = (iso: string) => accessWindow(checkIn, checkOut, new Date(iso));
  // Denver is UTC-7 in December.
  assert.equal(at('2026-12-08T20:00:00Z').open, false, 'the day before the day before is too early');
  assert.equal(at('2026-12-09T20:00:00Z').open, true, 'the day before check-in should open');
  assert.equal(at('2026-12-14T17:00:00Z').open, true, 'before noon on checkout day should still be open');
  assert.equal(at('2026-12-14T19:00:00Z').open, false, 'after noon on checkout day should close');
  assert.equal(at('2026-12-09T20:00:00Z').opensOn, '2026-12-09');
});

test('codesReady needs the window, the rules, and the agreement topics', () => {
  assert.equal(codesReady({ unlocked: true, acknowledged: true }), true);
  assert.equal(codesReady({ unlocked: false, acknowledged: true }), false);
  assert.equal(codesReady({ unlocked: true, acknowledged: false }), false);
  assert.equal(codesReady({ unlocked: true, acknowledged: true, agreementRead: false }), false);
});

test('the secrets helper never invents a value for an empty guide field', () => {
  const hidden = stayAccessSecrets({ unlocked: false, ready: true, wifiName: 'N', wifiPassword: 'P', doorCode: 'C', doorNotes: 'D' });
  assert.deepEqual(hidden, { wifiName: null, wifiPassword: null, doorCode: null, doorNotes: null });
  const blank = stayAccessSecrets({ unlocked: true, ready: true, wifiName: '', wifiPassword: ' ', doorCode: '', doorNotes: '' });
  assert.equal(blank.doorCode, null);
  assert.equal(blank.wifiPassword, null);
  assert.equal(blank.wifiName, null);
});
