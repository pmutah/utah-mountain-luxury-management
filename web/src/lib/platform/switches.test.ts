/**
 * The agent switches and the platform panel.
 *
 * The defect this file protects against is the one this codebase keeps repeating: a control that renders and does nothing. The
 * switches were a static list with a `defaultOn` flag and no store behind them, and four host routes had no caller at all.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isSwitchable, LOCKED_SWITCHES, readSwitches, SWITCHABLE, switchLine, writeSwitch } from '../../../functions/_lib/platform/switches.ts';

const root = join(process.cwd());

function fakeKv() {
  const map = new Map<string, string>();
  return {
    get: async (key: string) => map.get(key) ?? null,
    put: async (key: string, value: string) => void map.set(key, value),
    raw: map,
    breakReads: () => {
      throw new Error('KV is down');
    },
  };
}

test('a switch that was never written is off, and only the three known keys come back', async () => {
  const kv = fakeKv();
  const read = await readSwitches({ SETTINGS: kv } as never);
  assert.equal(read.ok, true);
  assert.deepEqual(read.state, { digest: false, snow: false, shadowDay: false });

  /*
   * An unknown key and a non-boolean in the store are ignored rather than passed through.
   *
   * A fresh env object per read is deliberate: the read cache lives on `env` and is scoped to one request, exactly as Cloudflare
   * does it. Reusing one env across two reads would test the cache, not the parser.
   */
  await kv.put('agentSwitches', JSON.stringify({ digest: true, snow: 'yes', publishRates: true }));
  const again = await readSwitches({ SETTINGS: kv } as never);
  assert.deepEqual(again.state, { digest: true, snow: false, shadowDay: false }, 'a non-boolean or a locked key was honoured');
});

test('a set on one switch leaves the other two alone', async () => {
  /*
   * Each call gets a fresh env because each is a separate request in production. Within a request the read cache is shared, which
   * is the point of it.
   */
  const kv = fakeKv();
  assert.equal((await writeSwitch({ SETTINGS: kv } as never, 'digest', true)).ok, true);
  assert.equal((await writeSwitch({ SETTINGS: kv } as never, 'snow', true)).ok, true);
  assert.equal((await writeSwitch({ SETTINGS: kv } as never, 'digest', false)).ok, true);
  const read = await readSwitches({ SETTINGS: kv } as never);
  assert.deepEqual(read.state, { digest: false, snow: true, shadowDay: false }, 'saving one switch cleared another');
});

test('a locked or unknown switch cannot be written at all', async () => {
  /*
   * `guestAutoReply` and `publishRates` are the two that could reach a guest or another channel. They are refused here as well as
   * in the route, so a caller that skips the route cannot set them either.
   */
  const kv = fakeKv();
  const env = { SETTINGS: kv } as never;
  for (const id of ['guestAutoReply', 'publishRates', 'somethingElse']) {
    assert.equal(isSwitchable(id), false, `${id} is settable`);
    const refused = await writeSwitch(env, id, true);
    assert.equal(refused.ok, false);
    assert.match(refused.ok === false ? refused.reason : '', /not a switch this page can set/);
    assert.equal(kv.raw.has('agentSwitches'), false, `writing ${id} still touched the store`);
  }
  assert.deepEqual(
    LOCKED_SWITCHES.map((row) => row.id).sort(),
    ['guestAutoReply', 'publishRates'],
  );
  for (const row of LOCKED_SWITCHES) {
    assert.ok(row.reason.length > 40, `${row.id} has no real reason`);
  }
});

test('a store that cannot be read is off and says so, never off and silent', async () => {
  /*
   * The distinction this whole platform keeps insisting on. If the store is down, the digest must not send (off is the safe
   * reading) and a host reading the panel must be told the switches could not be read, not shown three switches that look
   * deliberately turned off.
   */
  const env = {
    SETTINGS: {
      get: async () => {
        throw new Error('KV read failed');
      },
      put: async () => undefined,
    },
  } as never;
  const read = await readSwitches(env);
  assert.equal(read.ok, false);
  assert.deepEqual(read.state, { digest: false, snow: false, shadowDay: false });
  assert.match(read.ok === false ? read.reason : '', /could not be read/);
  // And a write is refused rather than overwriting whatever is there.
  const written = await writeSwitch(env, 'digest', true);
  assert.equal(written.ok, false);
});

test('each switch explains itself in a sentence with no promise it cannot keep', () => {
  for (const id of SWITCHABLE) {
    for (const on of [true, false]) {
      const line = switchLine(id, on);
      assert.ok(line.length > 20, `${id} has a thin line`);
      assert.doesNotMatch(line, /guest/i, `${id} mentions a guest, which no switch may message`);
    }
  }
});

test('the panel renders the switches as controls and names the locked ones', () => {
  const panel = readFileSync(join(root, 'src/components/PlatformPanel.tsx'), 'utf8');
  assert.match(panel, /platform-switch-toggle-/, 'the panel draws no control');
  assert.match(panel, /platform-switches-locked/, 'the panel does not name the locked switches');
  // Every route the panel calls has to exist.
  for (const route of ['/api/platform/switches', '/api/platform/funnel?window=7', '/api/platform/funnel?window=30', '/api/platform/audit', '/api/platform/health']) {
    assert.match(panel, new RegExp(route.replace(/[?&=]/g, (ch) => `\\${ch}`)), `the panel does not call ${route}`);
  }
  // A failed read is a failure, not a zero.
  assert.match(panel, /This is not a zero/, 'the funnel renders an unreadable state as a zero');
  assert.match(panel, /does not mean nothing changed/, 'the audit panel renders an unreadable log as an empty one');
  // And it is on the Agents page, which is where a host changes how the platform behaves.
  const hub = readFileSync(join(root, 'src/components/AgentsHub.tsx'), 'utf8');
  assert.match(hub, /PlatformPanel/, 'the panel is not mounted');
});

test('the funnel window is counted by visit, not by row', () => {
  /*
   * The query is the whole point: `COUNT(DISTINCT visit)` is what makes a reload one guest, and the `NOT EXISTS` subquery is what
   * turns the four fixed steps into an abandoned-quote count without inventing a fifth event.
   */
  const db = readFileSync(join(root, 'functions/_lib/platform/market-db.ts'), 'utf8');
  assert.match(db, /COUNT\(DISTINCT COALESCE\(visit/, 'the funnel counts rows, so a reload counts twice');
  assert.match(db, /NOT EXISTS/, 'the quote-without-checkout figure is not measured from visits');
  assert.match(db, /created_at >= \?/, 'the funnel is not bounded by the window');

  // The route takes the window and reports it, and refuses an absurd one by falling back to all-time counts.
  const route = readFileSync(join(root, 'functions/api/platform/funnel.ts'), 'utf8');
  assert.match(route, /searchParams\.get\('window'\)/);
  assert.match(route, /window=7/, 'the route does not document its window');
});

test('RevPAR and the goal forecast are on the market card', () => {
  /*
   * `paceWindows`, `trailingRevPar`, and `forecastGoal` lived in `market-intel.ts` and were called only from a test. Pace was
   * already rendered from `forwardWindows`, so the two that were genuinely missing are RevPAR and the goal chance.
   */
  const board = readFileSync(join(root, 'src/components/MarketBoard.tsx'), 'utf8');
  assert.match(board, /trailingRevPar\(/, 'the market card does not compute RevPAR');
  assert.match(board, /forecastGoal\(/, 'the market card does not forecast the goal');
  assert.match(board, /market-revpar-value/, 'RevPAR is computed and never drawn');
  assert.match(board, /market-goal-chance-value/, 'the forecast is computed and never drawn');
  // The goal remaining comes from the same function the annual-goal card reads, so the two cannot disagree.
  assert.match(board, /grossPace\(/, 'the forecast invents its own goal figure');
  // And it says it changes no price.
  assert.match(board, /changes\s+no price|no price\./, 'the forecast does not say it changes no price');
});
