/**
 * Platform spine: backup rules, the rate engine, tax, gates, webhooks, and the surfaces that show them.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { acceptLedgerRead, backupDirAllowed, integrityBaseline } from './integrity.ts';
import { FEATURE_CATALOG } from './feature-catalog.ts';
import { forecastGoal, loadComps, paceWindows, pickTop, rateBand, weekKey } from './market-intel.ts';
import {
  CHECKOUT_HOLD_MINUTES,
  cleanerPay,
  cutoverReady,
  draftReply,
  hoursToCheckIn,
  inspectRooms,
  quoteWithTax,
  splitPay,
  stripeReadiness,
  tripGate,
} from './guest-ops.ts';
import {
  abAssign,
  appendAudit,
  can,
  funnelEvent,
  housePin,
  lodgingTaxReport,
  logEvent,
  PLATFORM_AGENTS,
  radarDiff,
  schEExport,
  seasonFor,
  SECURITY_HEADERS,
} from './back-office.ts';
import { guardNight, mayPublish } from '../../../functions/_lib/market/rate-engine.ts';
import { hmacHex } from '../../../functions/_lib/platform/hooks.ts';
import { onRequestGet as healthGet } from '../../../functions/api/platform/health.ts';
import { onRequestGet as quoteGet } from '../../../functions/api/book/quote.ts';
import { onRequestPost as mcpPost } from '../../../functions/api/mcp/index.ts';
import { onRequestPost as stripeHook } from '../../../functions/api/hooks/stripe.ts';
import { onRequest as middleware } from '../../../functions/_middleware.ts';

const root = join(process.cwd());

test('a failed ledger read is not saved as an empty book', () => {
  const failed = acceptLedgerRead({ ok: false, error: 'KV read failed' });
  assert.equal(failed.save, false);
  const empty = acceptLedgerRead({ ok: true, rows: [] });
  assert.equal(empty.save, true);
  if (empty.save) assert.deepEqual(empty.rows, []);
});

test('the baseline totals expenses and leaves cancelled payouts out', () => {
  const baseline = integrityBaseline({
    expenses: [
      { propertyId: 'ranch', month: '2026-11', amount: 10.1 },
      { propertyId: 'ranch', month: '2026-11', amount: 1.2 },
    ],
    reservations: [
      { propertyId: 'ranch', checkIn: '2026-11-02', payout: 100, status: 'confirmed' },
      { propertyId: 'ranch', checkIn: '2026-11-08', payout: 50, status: 'cancelled' },
    ],
    receiptKeys: ['receipt:a'],
    constructionTotal: 5,
  });
  assert.equal(baseline.expenseCount, 2);
  assert.equal(baseline.expenseTotal, 11.3);
  assert.equal(baseline.reservationCount, 2);
  assert.equal(baseline.activeReservations, 1);
  assert.equal(baseline.payoutTotal, 100);
  assert.equal(baseline.receiptCount, 1);
  assert.equal(baseline.expensesByHouseMonth[0]?.total, 11.3);
});

test('a backup directory inside the repo is refused', () => {
  assert.equal(backupDirAllowed('C:/repo/wilhite-portfolio', 'C:/repo/wilhite-portfolio/web'), false);
  assert.equal(backupDirAllowed('C:/repo/wilhite-portfolio', 'C:/Users/me/uml-data-backups'), true);
  const script = readFileSync(join(root, 'scripts/backup-kv-readonly.mjs'), 'utf8');
  assert.match(script, /Refusing to write a backup inside the git repo/);
  assert.equal(/kv key delete|\.delete\(/.test(script), false);
});

test('the catalog only uses the four status words and explains every planned or skipped row', () => {
  assert.ok(FEATURE_CATALOG.length > 30);
  for (const row of FEATURE_CATALOG) {
    assert.ok(row.status === 'match' || row.status === 'beat' || row.status === 'planned' || row.status === 'skip');
    if (row.status === 'planned' || row.status === 'skip') assert.ok(row.reason.length > 20, row.id);
  }
  const doc = readFileSync(join(root, '../docs/feature-registry.md'), 'utf8');
  assert.match(doc, /feature-catalog\.ts/);
});

test('comps without a key are fixtures, and a pinned comp stays first', () => {
  const loaded = loadComps({ house: 'river' });
  assert.equal(loaded.source, 'fixture');
  assert.match(loaded.reason, /No AirROI key/);
  const capped = loadComps({ house: 'river', apiKey: 'key', spentCents: 500, quoteCents: 200 });
  assert.match(capped.reason, /budget/);
  const picked = pickTop(
    [
      { id: 'a', house: 'river', name: 'A', sleeps: 10, rating: 4, reviews: 1, guestFavorite: false, distanceMi: 20, nightly: 1, source: 'fixture' },
      { id: 'b', house: 'river', name: 'B', sleeps: 22, rating: 5, reviews: 9, guestFavorite: true, distanceMi: 1, nightly: 1, source: 'fixture' },
    ],
    { houseSleeps: 22, pinned: ['a'] },
  );
  assert.equal(picked[0]?.id, 'a');
  assert.equal(weekKey('2026-11-10'), weekKey('2026-11-12'));
});

test('bands, pace, and the forecast are stable', () => {
  const band = rateBand([100, 200, 300, 400]);
  assert.equal(band.n, 4);
  assert.equal(band.median, 250);
  const pace = paceWindows([...Array(30).fill(true), ...Array(60).fill(false)]);
  assert.equal(pace.d30, 1);
  assert.ok(pace.d90 < 0.5);
  const first = forecastGoal({ nights: [{ rate: 100, probability: 1 }], goalRemaining: 100, draws: 20, seed: 3 });
  const second = forecastGoal({ nights: [{ rate: 100, probability: 1 }], goalRemaining: 100, draws: 20, seed: 3 });
  assert.deepEqual(first, second);
  assert.equal(first.chanceOfGoal, 1);
});

test('the rate engine leaves booked nights, caps a raise, and never sends', () => {
  const booked = guardNight({
    house: 'lindon',
    date: '2026-12-08',
    ourGuest: 179,
    compRates: [400, 420, 450],
    floorGuest: 50,
    ceilingGuest: 900,
    booked: true,
    closed: false,
    holiday: false,
    paused: false,
    killSwitch: false,
    nights: 2,
  });
  assert.equal(booked.action, 'untouched');
  assert.equal(booked.proposedGuest, 179);
  assert.equal(booked.send, false);
  const raised = guardNight({
    house: 'lindon',
    date: '2026-12-09',
    ourGuest: 100,
    compRates: [400, 420, 450],
    floorGuest: 50,
    ceilingGuest: 900,
    booked: false,
    closed: false,
    holiday: false,
    paused: false,
    killSwitch: false,
    nights: 2,
  });
  assert.equal(raised.proposedGuest, 108);
  assert.equal(raised.send, false);
  const river = guardNight({
    house: 'river',
    date: '2026-12-10',
    ourGuest: 2000,
    compRates: [2200, 2300, 2400],
    floorGuest: 1500,
    ceilingGuest: 5000,
    booked: false,
    closed: false,
    holiday: false,
    paused: false,
    killSwitch: false,
    nights: 1,
  });
  assert.equal(river.action, 'refused');
  assert.equal(mayPublish({ shadowDays: 6, switchOn: true, tokenPresent: true }), false);
  assert.equal(mayPublish({ shadowDays: 7, switchOn: true, tokenPresent: true }), true);
});

test('tax lines foot and stay out of the quoted total', () => {
  const tax = quoteWithTax({ lodging: 100, cleaning: 50, pet: 0 });
  assert.equal(tax.subtotal, 150);
  assert.equal(tax.stateTax, 7.28);
  assert.equal(tax.countyTax, 6.38);
  assert.equal(tax.estimatedTotal, 163.66);
  assert.equal(tax.includedInQuotedStay, false);
  assert.equal(tax.charged, false);
  assert.equal(tax.confirmed, false);
  const shares = splitPay(100, ['A', 'B', 'C']);
  assert.equal(Math.round(shares.reduce((sum, share) => sum + Math.round(share.amount * 100), 0)), 10000);
  assert.equal(CHECKOUT_HOLD_MINUTES, 15);
  assert.equal(cutoverReady(), false);
  assert.equal(stripeReadiness({ STRIPE_SECRET_KEY: 'sk_live_x' }).mode, 'refused-live');
  assert.equal(stripeReadiness({}).charges, false);
});

test('the door stays shut until every step, the window, and a code', () => {
  const early = tripGate({
    details: true,
    agreement: true,
    idVerified: true,
    depositSettled: true,
    hoursUntilCheckIn: 48,
    otpOk: true,
    nightBeforeFree: true,
    connected: { id: true, deposit: true },
  });
  assert.equal(early.doorRevealed, false);
  assert.equal(early.unlock, false);
  assert.equal(early.earlyCheckInOffer, true);
  const open = tripGate({
    details: true,
    agreement: true,
    idVerified: true,
    depositSettled: true,
    hoursUntilCheckIn: 20,
    otpOk: true,
    nightBeforeFree: false,
    connected: { id: true, deposit: true },
  });
  assert.equal(open.doorRevealed, true);
  // A date that could not be read is not a window: no countdown means no code.
  assert.equal(
    tripGate({
      details: true,
      agreement: true,
      idVerified: true,
      depositSettled: true,
      hoursUntilCheckIn: null,
      otpOk: true,
      nightBeforeFree: false,
      connected: { id: true, deposit: true },
    }).doorRevealed,
    false,
  );
});

test('the steps card shows only what this site can actually collect', () => {
  /*
   * The defect: the card drew four steps and passed `idVerified: false` and `depositSettled: false` literally, so every guest
   * read "Still open. ID check is not set up" and "Still open. Deposit is arranged directly" — two things no route here does.
   * An unconnected step is now left out and named as not set up.
   */
  const gate = tripGate({
    details: true,
    agreement: true,
    idVerified: false,
    depositSettled: false,
    hoursUntilCheckIn: 100,
    otpOk: false,
    nightBeforeFree: false,
  });
  assert.deepEqual(gate.steps.map((step) => step.id), ['details', 'agreement']);
  assert.deepEqual(gate.notSetUp, ['id', 'deposit']);
  assert.equal(gate.doorRevealed, false);
  const connected = tripGate({
    details: false,
    agreement: false,
    idVerified: false,
    depositSettled: false,
    hoursUntilCheckIn: 1,
    otpOk: true,
    nightBeforeFree: false,
    connected: { id: true, deposit: true },
  });
  assert.deepEqual(connected.steps.map((step) => step.id), ['details', 'agreement', 'id', 'deposit']);
  assert.deepEqual(connected.notSetUp, []);

  // And the card reads the stay's own date and the house's own time instead of a literal.
  const stay = readFileSync(join(root, 'src/components/StayApp.tsx'), 'utf8');
  assert.doesNotMatch(stay, /hoursUntilCheckIn: 48/, 'the check-in card still passes a hardcoded 48 hours');
  assert.match(stay, /hoursToCheckIn\(/, 'the check-in card does not compute real hours');
  assert.match(stay, /nightBeforeFree: nightBeforeFree === true/, 'the early night is still hardcoded off');
});

test('hours to check-in is real arithmetic in Mountain Time', () => {
  /*
   * The value this replaces was the literal `48`, which meant the 24-hour window could never open from a real date. These pin
   * the arithmetic on both sides of a daylight-saving change, because a fixed -7 would put a July check-in an hour late.
   */
  // 2026-07-15 4:00 PM MDT (UTC-6) is 22:00 UTC. From noon UTC that day: 10 hours.
  assert.equal(
    hoursToCheckIn({ now: new Date('2026-07-15T12:00:00Z'), checkIn: '2026-07-15', checkInTime: '4:00 PM' }),
    10,
  );
  // 2026-11-15 4:00 PM MST (UTC-7) is 23:00 UTC.
  assert.equal(
    hoursToCheckIn({ now: new Date('2026-11-15T12:00:00Z'), checkIn: '2026-11-15', checkInTime: '4:00 PM' }),
    11,
  );
  // A stay three days out is about 72 hours, so the window is closed.
  const far = hoursToCheckIn({ now: new Date('2026-11-12T12:00:00Z'), checkIn: '2026-11-15', checkInTime: '4:00 PM' });
  assert.ok(far !== null && far > 24, `three days out read as ${far} hours`);
  // Check-in has passed, which is a negative number rather than an error.
  const past = hoursToCheckIn({ now: new Date('2026-11-16T12:00:00Z'), checkIn: '2026-11-15', checkInTime: '4:00 PM' });
  assert.ok(past !== null && past < 0, `a past check-in read as ${past}`);
  // A malformed date is null, not a guess.
  assert.equal(hoursToCheckIn({ now: new Date('2026-11-15T12:00:00Z'), checkIn: 'not-a-day', checkInTime: '4:00 PM' }), null);
  assert.equal(hoursToCheckIn({ now: new Date('2026-11-15T12:00:00Z'), checkIn: '2026-02-30', checkInTime: '4:00 PM' }), null);
});

test('cleaner pay, photo flags, and drafts do not invent or send', () => {
  assert.equal(cleanerPay('lindon').usd, 160);
  assert.equal(cleanerPay('ranch').usd, 350);
  assert.equal(cleanerPay('river').usd, null);
  const photos = inspectRooms({ required: ['kitchen', 'loft'], submitted: ['kitchen'] });
  assert.deepEqual(photos.flags, ['No photo for loft.']);
  assert.equal(photos.visionCalled, false);
  assert.equal(draftReply({ text: 'come at noon', confidence: 0.99, guidelineHit: true }).action, 'hold');
  assert.equal(draftReply({ text: 'see you', confidence: 0.99, guidelineHit: false, autoReplyEnabled: true }).sent, false);
});

test('roles, audit, tax report, and the filed return stay in their lanes', () => {
  assert.equal(can('owner', 'edit-expense'), false);
  assert.equal(can('owner', 'read-lindon'), false);
  assert.equal(can('owner', 'read-owner'), true);
  assert.equal(can('cleaner', 'read-clean'), true);
  const refused = appendAudit([], { at: '2026-11-10', actor: 'host', action: 'delete-expenses', target: 'all' });
  assert.equal(refused.ok, false);
  const report = lodgingTaxReport([
    { house: 'lindon', lodging: 100, cleaning: 0, channel: 'direct' },
    { house: 'ranch', lodging: 200, cleaning: 0, channel: 'airbnb' },
  ]);
  assert.equal(report.confirmed, false);
  assert.equal(report.rows[1]?.estimatedTax, null);
  assert.equal(schEExport().included, false);
});

test('agents default risky work off, and logs drop secrets', () => {
  const revenue = PLATFORM_AGENTS.find((agent) => agent.id === 'revenue');
  assert.equal(revenue?.defaultOn, false);
  assert.equal(revenue?.sends, false);
  const line = logEvent({ event: 'health', secret: 'nope', token: 'nope', ok: true });
  assert.equal(line.includes('nope'), false);
  assert.equal(funnelEvent('quote', 'river').stored, false);
  assert.equal(abAssign('guest-1', 'hero', ['a', 'b']), abAssign('guest-1', 'hero', ['a', 'b']));
  assert.equal(seasonFor('2026-12'), 'ski');
  assert.equal(seasonFor('2026-06'), 'river');
  assert.equal(housePin([{ propertyId: 'ranch', checkIn: '2026-11-01', checkOut: '2026-11-10', status: 'confirmed' }], 'ranch', '2026-11-10'), 'turnover');
  assert.equal(SECURITY_HEADERS['X-Content-Type-Options'], 'nosniff');
  assert.ok(radarDiff().some((row) => row.featureId === 'seam-unlock'));
});

test('health hides secrets, the quote foots, a bad webhook is refused, and a delete is refused', async () => {
  const cookie = `wpm_auth=${btoa('wpm:pw').replace(/=+$/, '')}`;
  const health = await healthGet({
    request: new Request('https://x/api/platform/health', { headers: { Cookie: cookie } }),
    env: {
      DASHBOARD_PASSWORD: 'pw',
      AIRROI_API_KEY: 'super-secret-value',
      SETTINGS: { async get() { return null; } },
    },
    params: {},
  });
  const healthText = await health.text();
  assert.equal(health.status, 200);
  assert.equal(healthText.includes('super-secret-value'), false);
  assert.match(healthText, /"airroi":true/);
  const closed = await healthGet({
    request: new Request('https://x/api/platform/health'),
    env: { DASHBOARD_PASSWORD: 'pw' },
    params: {},
  });
  assert.equal(closed.status, 401);

  const quote = await quoteGet({
    request: new Request('https://x/api/book/quote?lodging=100&cleaning=50'),
    env: {},
    params: {},
  });
  const quoteBody = (await quote.json()) as { estimatedTotal: number; charged: boolean };
  assert.equal(quote.status, 200);
  assert.equal(quoteBody.estimatedTotal, 163.66);
  assert.equal(quoteBody.charged, false);

  const unsigned = await stripeHook({
    request: new Request('https://x/api/hooks/stripe', { method: 'POST', body: '{}' }),
    env: { HOOK_SECRET: 'hook' },
    params: {},
  });
  assert.equal(unsigned.status, 401);
  const body = '{"type":"test"}';
  const signature = await hmacHex('hook', body);
  const signed = await stripeHook({
    request: new Request('https://x/api/hooks/stripe', {
      method: 'POST',
      headers: { 'x-uml-signature': signature },
      body,
    }),
    env: { HOOK_SECRET: 'hook', SETTINGS: { async get() { return null; } } },
    params: {},
  });
  const signedBody = (await signed.json()) as { stored: boolean; touchedBooks: boolean };
  assert.equal(signed.status, 202);
  assert.equal(signedBody.stored, false);
  assert.equal(signedBody.touchedBooks, false);

  const deleted = await mcpPost({
    request: new Request('https://x/api/mcp', {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'integrity_check', arguments: { delete: true } }),
    }),
    env: { DASHBOARD_PASSWORD: 'pw', SETTINGS: { async get() { return null; } } },
    params: {},
  });
  assert.equal(deleted.status, 400);
});

test('the desk, the booking page, and the middleware show the new surfaces', () => {
  const today = readFileSync(join(root, 'src/components/TodayDesk.tsx'), 'utf8');
  const book = readFileSync(join(root, 'src/components/DirectBook.tsx'), 'utf8');
  const stay = readFileSync(join(root, 'src/components/StayApp.tsx'), 'utf8');
  const agents = readFileSync(join(root, 'src/components/AgentsHub.tsx'), 'utf8');
  const app = readFileSync(join(root, 'src/App.tsx'), 'utf8');
  const middleware = readFileSync(join(root, 'functions/_middleware.ts'), 'utf8');
  assert.match(today, /MissionMap/);
  assert.match(today, /MorningList/);
  const morning = readFileSync(join(root, 'src/components/MorningList.tsx'), 'utf8');
  // A failed read must say it failed, not render "nothing is waiting".
  assert.match(morning, /could not be read from this server/);
  assert.match(morning, /does not mean nothing is waiting/);
  assert.match(book, /stay-tax-estimate/);
  assert.match(stay, /stay-checkin-steps/);
  assert.match(agents, /agent-toggles/);
  assert.match(app, /TabErrorBoundary/);
  assert.match(middleware, /\/api\/hooks\//);
  assert.match(middleware, /\/api\/funnel/);
  assert.match(middleware, /X-Content-Type-Options|SECURITY_HEADERS/);
  const bridge = readFileSync(join(root, 'src/lib/uml-bridge.ts'), 'utf8');
  assert.match(bridge, /navigate/);
});

test('the funnel records a step and a house, never a person', async () => {
  const { funnelBody, visitId, sendFunnel, FUNNEL_STEPS } = await import('./funnel-client.ts');
  assert.deepEqual(FUNNEL_STEPS, ['view', 'quote', 'checkout', 'paid']);
  const visit = visitId({ getItem: () => null, setItem: () => {} });
  assert.match(visit, /^[A-Za-z0-9_-]{8,64}$/);
  // A step outside the four, or a house we do not rent, is not sent at all.
  assert.equal(funnelBody('bought', 'ranch', visit), null);
  assert.equal(funnelBody('view', 'hotel', visit), null);
  assert.equal(funnelBody('view', 'ranch', 'bad id'), null);
  assert.deepEqual(funnelBody('view', 'ranch', visit), { step: 'view', house: 'ranch', visit });
  // Nothing identifying is in the body: exactly three keys, and no field that names a person.
  const payload = funnelBody('quote', 'river', visit)!;
  assert.deepEqual(Object.keys(payload).sort(), ['house', 'step', 'visit']);
  for (const field of ['email', 'phone', 'name', 'address', 'ip']) {
    assert.equal(field in payload, false, `the funnel body carries a ${field} field`);
  }
  // A dev build never posts: the dev server proxies /api to production.
  let called = 0;
  const offline = await sendFunnel('view', 'ranch', { prod: false, visit, fetchImpl: (async () => { called += 1; return new Response('{}'); }) as typeof fetch, storage: { getItem: () => visit, setItem: () => {} } });
  assert.equal(offline, false);
  assert.equal(called, 0, 'a dev build posted a funnel row');
  // A failed send is false, not a broken page.
  const failed = await sendFunnel('view', 'ranch', { prod: true, visit, fetchImpl: (async () => { throw new Error('offline'); }) as unknown as typeof fetch, storage: { getItem: () => visit, setItem: () => {} } });
  assert.equal(failed, false);
});

test('nights at risk counts a stranded night and leaves a bookable one alone', async () => {
  const { nightsAtRisk, nightsAtRiskLine } = await import('./nights-at-risk.ts');
  /*
   * The count has to come from the booking engine, not a second copy of the minimum-stay rule. River refuses a one-night
   * stay outright, so a lone night there is stranded; a stretch of several nights is bookable and must not be counted.
   */
  const lone = nightsAtRisk({
    reservations: [
      { propertyId: 'river', checkIn: '2026-11-10', checkOut: '2026-11-12', status: 'confirmed' },
      { propertyId: 'river', checkIn: '2026-11-13', checkOut: '2026-11-22', status: 'confirmed' },
    ],
    asOf: '2026-11-10',
    horizonDays: 14,
  }).find((row) => row.house === 'river')!;
  assert.equal(lone.unsellable > 0, true, 'a lone night at the River was not counted as stranded');
  assert.equal(lone.firstUnsellable, '2026-11-12');

  const open = nightsAtRisk({
    reservations: [{ propertyId: 'river', checkIn: '2026-11-20', checkOut: '2026-11-24', status: 'confirmed' }],
    asOf: '2026-11-10',
    horizonDays: 10,
  }).find((row) => row.house === 'river')!;
  assert.equal(open.unsellable, 0, 'a stretch some stay can book was counted as stranded');

  // A night the host closed is not at risk: they chose it.
  const closedNight = nightsAtRisk({
    reservations: [
      { propertyId: 'river', checkIn: '2026-11-10', checkOut: '2026-11-12', status: 'confirmed' },
      { propertyId: 'river', checkIn: '2026-11-13', checkOut: '2026-11-22', status: 'confirmed' },
    ],
    asOf: '2026-11-10',
    horizonDays: 14,
    closed: { river: ['2026-11-12'] },
  }).find((row) => row.house === 'river')!;
  assert.equal(closedNight.unsellable, 0, 'a night the host closed was counted as stranded');

  // A cancelled stay does not cover its nights.
  const cancelled = nightsAtRisk({
    reservations: [{ propertyId: 'river', checkIn: '2026-11-10', checkOut: '2026-11-20', status: 'cancelled' }],
    asOf: '2026-11-10',
    horizonDays: 14,
  }).find((row) => row.house === 'river')!;
  assert.equal(cancelled.openNights > 0, true, 'a cancelled stay was treated as covering its nights');
  assert.equal(cancelled.unsellable, 0, 'an open stretch was counted as stranded');

  assert.match(nightsAtRiskLine([{ house: 'ranch', openNights: 4, unsellable: 2, firstUnsellable: '2026-11-12' }]), /Ranch 2 of 4 open nights/);
  assert.match(nightsAtRiskLine([{ house: 'ranch', openNights: 3, unsellable: 0, firstUnsellable: null }]), /Nothing is stranded/);
});

test('the bot check never reads "no secret" as "verified"', async () => {
  const { turnstileState, siteKeyFrom, verifyTurnstile } = await import('./../../../functions/_lib/platform/turnstile.ts');
  assert.equal(turnstileState({}), 'unconfigured');
  assert.equal(turnstileState({ TURNSTILE_SECRET: '   ' }), 'unconfigured');
  assert.equal(turnstileState({ TURNSTILE_SECRET: 's' }), 'configured');
  assert.equal(siteKeyFrom({}), null);
  assert.equal(siteKeyFrom({ TURNSTILE_SITE_KEY: ' site-key ' }), 'site-key');

  // No secret: not verified, and it says so rather than returning a silent pass.
  const skipped = await verifyTurnstile({ env: {}, token: '', action: 'book_request' });
  assert.equal(skipped.ok, true);
  assert.equal(skipped.ok === true && skipped.skipped, true);
  assert.match(skipped.ok === true ? skipped.reason : '', /not configured/);

  // A secret and no token is a refusal.
  const missing = await verifyTurnstile({ env: { TURNSTILE_SECRET: 's' }, token: '', action: 'book_request' });
  assert.equal(missing.ok, false);

  // A failed check is a refusal, including a network error.
  const failed = await verifyTurnstile({
    env: { TURNSTILE_SECRET: 's' },
    token: 'tok',
    action: 'book_request',
    fetchImpl: (async () => new Response(JSON.stringify({ success: false }))) as typeof fetch,
  });
  assert.equal(failed.ok, false);

  const offline = await verifyTurnstile({
    env: { TURNSTILE_SECRET: 's' },
    token: 'tok',
    action: 'book_request',
    fetchImpl: (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch,
  });
  assert.equal(offline.ok, false, 'a failed check let a request through');

  // The action has to match, so a token minted for another form cannot be replayed here.
  const wrongAction = await verifyTurnstile({
    env: { TURNSTILE_SECRET: 's' },
    token: 'tok',
    action: 'book_request',
    fetchImpl: (async () =>
      new Response(JSON.stringify({ success: true, action: 'newsletter', hostname: 'x' }))) as typeof fetch,
  });
  assert.equal(wrongAction.ok, false);

  // The hostname has to be on the approved list when one is set.
  const wrongHost = await verifyTurnstile({
    env: { TURNSTILE_SECRET: 's', TURNSTILE_HOSTNAMES: 'wilhite-portfolio.pages.dev' },
    token: 'tok',
    action: 'book_request',
    fetchImpl: (async () =>
      new Response(JSON.stringify({ success: true, action: 'book_request', hostname: 'evil.example' }))) as typeof fetch,
  });
  assert.equal(wrongHost.ok, false);

  // And a good token passes.
  const good = await verifyTurnstile({
    env: { TURNSTILE_SECRET: 's', TURNSTILE_HOSTNAMES: 'wilhite-portfolio.pages.dev' },
    token: 'tok',
    action: 'book_request',
    fetchImpl: (async () =>
      new Response(JSON.stringify({ success: true, action: 'book_request', hostname: 'wilhite-portfolio.pages.dev' }))) as typeof fetch,
  });
  assert.deepEqual(good, { ok: true, skipped: false });
});

test('the kill switch the plan reads is the one the board writes', async () => {
  const { readPause, writePause, pauseLine, ALL_PAUSED, ALL_UNPAUSED } = await import('./../../../functions/_lib/platform/pause-store.ts');
  /*
   * The defect this guards: the Market board's Pause button toggled React state, and `/api/pricing/push-plan` hard-coded
   * `paused: false`. A switch the authoritative plan does not read is not a switch, so the source is checked rather than the
   * behaviour of one component.
   */
  const plan = readFileSync(join(root, 'functions/api/pricing/push-plan.ts'), 'utf8');
  assert.match(plan, /readPause\(/, 'the plan does not read the kill switch');
  assert.match(plan, /runShadow\(board, taken, pause\.paused\[house\]/, 'the plan does not pass the house switch into the shadow run');
  assert.equal(/paused: \{ river: false, ranch: false, lindon: false \}/.test(plan), false, 'the plan still hard-codes every house as unpaused');

  const board = readFileSync(join(root, 'src/components/MarketBoard.tsx'), 'utf8');
  assert.match(board, /setPricingPause/, 'the board does not save the switch');
  assert.match(board, /getPricingPause/, 'the board does not read the switch');
  assert.equal(
    /onClick=\{\(\) => setPaused\(/.test(board),
    false,
    'the pause button still only flips local state',
  );

  // A missing binding is not "off": every house reads paused.
  const unbound = await readPause({});
  assert.equal(unbound.ok, false);
  assert.deepEqual(unbound.paused, ALL_PAUSED, 'an unreadable switch read as unpaused');
  assert.deepEqual(ALL_UNPAUSED, { ranch: false, lindon: false, river: false });

  const refused = await writePause({}, 'river', false, null);
  assert.equal(refused.ok, false, 'a missing binding reported the switch as saved');

  assert.match(pauseLine('ranch', true, 'Water leak'), /Ranch is paused/);
  assert.match(pauseLine('ranch', true, 'Water leak'), /No night is raised or promoted/);
  // A reason that already ends in a full stop does not read "deck..".
  const said = pauseLine('river', true, 'Water leak under the deck.');
  assert.equal(said.includes('..'), false, 'a typed full stop doubled');
  assert.match(said, /under the deck\./);
  assert.match(pauseLine('ranch', false), /not paused/);
});

test('the change log is written by the plan and says when it failed', async () => {
  const { shouldLog, logChanges, changeLine, readChanges } = await import('./../../../functions/_lib/platform/change-log.ts');
  /*
   * The shape this guards: `rate_changes` existed from the first migration, `changeLogEntry` was defined in the rate engine
   * and never called, and nothing had ever written a row. A change log that is a table with no writer is a label.
   */
  const plan = readFileSync(join(root, 'functions/api/pricing/push-plan.ts'), 'utf8');
  assert.match(plan, /logChanges\(env, moved\)/, 'the plan does not write the change log');
  assert.match(plan, /changeLog,/, 'the plan does not report what the log took');
  assert.match(plan, /kind === 'promote'/, 'the log does not explain a promotion');

  // A hold is not a change, and neither is a night with no rate.
  assert.equal(shouldLog({ house: 'river', date: '2026-12-08', beforeRate: 900, afterRate: 900, reason: 'x', mode: 'shadow' }), false);
  assert.equal(shouldLog({ house: 'river', date: '2026-12-08', beforeRate: 900, afterRate: 972, reason: 'x', mode: 'shadow' }), true);
  assert.equal(shouldLog({ house: 'river', date: 'not-a-date', beforeRate: 900, afterRate: 972, reason: 'x', mode: 'shadow' }), false);
  assert.equal(shouldLog({ house: 'hotel' as never, date: '2026-12-08', beforeRate: 1, afterRate: 2, reason: 'x', mode: 'shadow' }), false);

  // No database: reported, not silently dropped.
  const unbound = await logChanges({}, [{ house: 'river', date: '2026-12-08', beforeRate: 900, afterRate: 972, reason: 'x', mode: 'shadow' }]);
  assert.equal(unbound.ok, false);
  assert.match(unbound.ok === false ? unbound.reason : '', /not bound/);
  // And nothing to log is a success with no database needed.
  const empty = await logChanges({}, []);
  assert.deepEqual(empty, { ok: true, written: 0, skipped: 0 });

  // A failed read is reported, so an unread log cannot render as "no rate moved".
  const read = await readChanges({}, 20);
  assert.equal(read.ok, false);

  assert.match(
    changeLine({ house: 'river', date: '2026-12-08', before_rate: 900, after_rate: 972, reason: 'A raise.', mode: 'shadow', created_at: '' }),
    /River, 2026-12-08: raised \$900 → \$972\. A raise\. Nothing was sent\./,
  );
  assert.match(
    changeLine({ house: 'ranch', date: '2026-12-09', before_rate: 900, after_rate: 720, reason: 'Promotion.', mode: 'shadow', created_at: '' }),
    /lowered \$900 → \$720/,
  );
});

test('the change log panel is on the market tab and tells an empty log from a failed one', () => {
  const board = readFileSync(join(root, 'src/components/MarketBoard.tsx'), 'utf8');
  const panel = readFileSync(join(root, 'src/components/ChangeLogPanel.tsx'), 'utf8');
  assert.match(board, /ChangeLogPanel/, 'the market tab does not render the change log');
  assert.match(panel, /No night has moved yet/, 'an empty log has no wording');
  assert.match(panel, /This does not mean no rate moved/, 'a failed read reads as an empty log');
  assert.match(panel, /market-changes-off/, 'there is no way to see that the log failed');
});

test('the change log writes a row through a real statement, with the reason and mode', async () => {
  const { logChanges, readChanges } = await import('./../../../functions/_lib/platform/change-log.ts');
  // A database that records what the writer actually sent, so the columns and the mode are checked rather than assumed.
  const written: Array<{ sql: string; params: unknown[] }> = [];
  const recording = {
    prepare(sql: string) {
      const statement = {
        bind(...params: unknown[]) {
          written.push({ sql, params });
          return statement;
        },
        async all() {
          return { results: [] };
        },
        async run() {
          return { success: true };
        },
      };
      return statement;
    },
  };
  const result = await logChanges({ MARKET_DB: recording }, [
    { house: 'river', date: '2026-12-08', beforeRate: 900, afterRate: 972, reason: 'A raise toward p85.', mode: 'shadow' },
    { house: 'river', date: '2026-12-09', beforeRate: 900, afterRate: 900, reason: 'A hold.', mode: 'shadow' },
  ]);
  assert.deepEqual(result, { ok: true, written: 1, skipped: 1 }, 'a hold was written to the change log');
  // One clear plus one insert for the single night that moved, so a re-run cannot duplicate it.
  assert.equal(written.length, 2, 'the writer did not clear the night before inserting it');
  assert.match(written[0]!.sql, /DELETE FROM rate_changes/, 'a re-run would append a duplicate row');
  assert.match(written[0]!.sql, /mode = 'shadow'/, 'the clear would remove a live row');
  assert.match(written[1]!.sql, /INSERT INTO rate_changes/);
  assert.match(written[1]!.sql, /'shadow'/, 'the row does not record its mode');
  assert.deepEqual(written[1]!.params.slice(0, 5), ['river', '2026-12-08', 900, 972, 'A raise toward p85.']);

  // A statement that fails is reported, not swallowed. The clear succeeds and the insert refuses.
  const failing = {
    prepare(sql: string) {
      const statement = {
        bind() {
          return statement;
        },
        async all() {
          return { results: [] };
        },
        async run() {
          if (/INSERT/.test(sql)) throw new Error('D1 refused');
          return { success: true };
        },
      };
      return statement;
    },
  };
  const failed = await logChanges({ MARKET_DB: failing }, [
    { house: 'ranch', date: '2026-12-08', beforeRate: 500, afterRate: 540, reason: 'A raise.', mode: 'shadow' },
  ]);
  assert.equal(failed.ok, false);

  // The reader asks for the newest first and caps the limit, so a query cannot ask for everything.
  const readCalls: unknown[][] = [];
  const reader = {
    prepare(sql: string) {
      const statement = {
        bind(...params: unknown[]) {
          readCalls.push(params);
          return statement;
        },
        async all() {
          return { results: [{ house: 'river', date: '2026-12-08', before_rate: 900, after_rate: 972, reason: 'r', mode: 'shadow', created_at: 'x' }] };
        },
        async run() {
          return { success: true };
        },
      };
      return statement;
    },
  };
  const rows = await readChanges({ MARKET_DB: reader }, 5000);
  assert.equal(rows.ok, true);
  assert.equal(rows.ok === true ? rows.rows.length : 0, 1);
  assert.deepEqual(readCalls[0], [200], 'the read was not capped at the documented maximum');
});

test('an offline tick is kept on the phone and never claimed as saved', async () => {
  const {
    queueTick,
    loadQueue,
    clearSent,
    mergeDone,
    offlineLine,
    saveCachedJobs,
    loadCachedJobs,
  } = await import('./clean-offline.ts');
  // A localStorage stand-in, so the ordering rules are exercised rather than assumed.
  const store = (() => {
    const map = new Map<string, string>();
    return {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
      removeItem: (k: string) => void map.delete(k),
      clear: () => map.clear(),
      key: () => null,
      length: 0,
      raw: map,
    } as unknown as Storage;
  })();

  const token = 'cleaner-token-abc';
  assert.deepEqual(loadQueue(store, token), []);
  assert.deepEqual(loadQueue(undefined, token), [], 'no storage lost the page instead of failing soft');

  // One turn, two ticks before a send: the queue carries the latest list once, not one entry per tap.
  queueTick(store, token, { house: 'ranch', checkout: '2026-11-22', done: ['beds'] });
  queueTick(store, token, { house: 'ranch', checkout: '2026-11-22', done: ['beds', 'baths'] });
  const queued = loadQueue(store, token);
  assert.equal(queued.length, 1, 'two ticks on one turn made two queue entries');
  assert.deepEqual(queued[0]!.done, ['beds', 'baths'], 'the queue did not keep the latest tick list');

  // A second turn queues separately.
  queueTick(store, token, { house: 'river', checkout: '2026-11-23', done: ['deck'] });
  assert.equal(loadQueue(store, token).length, 2);

  // A confirmed turn leaves only itself behind.
  clearSent(store, token, 'ranch', '2026-11-22');
  const after = loadQueue(store, token);
  assert.deepEqual(after.map((row) => row.house), ['river'], 'clearing one turn removed another');

  /*
   * Two links on one phone must not mix. The key is derived from the token, so a second cleaner's link cannot read the first
   * one's cache — which would show another person's turns and let their ticks be sent under the wrong token.
   */
  saveCachedJobs(store, token, { jobs: [{ house: 'ranch' }] });
  assert.ok(loadCachedJobs(store, token), 'the cached list was not kept');
  assert.equal(loadCachedJobs(store, 'a-different-token'), null, 'two tokens shared one cache');

  // The merge shows a queued tick as ticked, and never drops a server tick.
  assert.deepEqual(mergeDone(['beds'], ['baths']), ['beds', 'baths']);
  assert.deepEqual(mergeDone(['beds', 'baths'], []), ['beds', 'baths']);
  assert.deepEqual(mergeDone([], []), []);

  /*
   * The wording is the part a cleaner acts on. "Not sent yet" must appear whenever anything is queued, and offline must say
   * the ticks are on the phone rather than implying they are nowhere.
   */
  assert.equal(offlineLine({ unsent: 0, online: true, saving: false }), '', 'an online page with nothing queued said something');
  assert.match(offlineLine({ unsent: 1, online: true, saving: false }), /1 turn not sent yet/);
  assert.match(offlineLine({ unsent: 1, online: true, saving: false }), /kept on this phone/);
  assert.match(offlineLine({ unsent: 3, online: false, saving: false }), /Offline\. 3 turns kept on this phone/);
  assert.match(offlineLine({ unsent: 0, online: false, saving: false }), /Offline/);
  assert.match(offlineLine({ unsent: 2, online: true, saving: true }), /Sending 2 turns/);
  // The line never says a queued tick is saved.
  for (const line of [
    offlineLine({ unsent: 1, online: true, saving: false }),
    offlineLine({ unsent: 2, online: false, saving: false }),
  ]) {
    assert.equal(/saved|recorded/i.test(line), false, `the offline line claims the tick was saved: ${line}`);
  }
});

test('the cleaner page keeps a tick before it asks, and the shell opens offline', () => {
  const page = readFileSync(join(root, 'src/components/CleanLink.tsx'), 'utf8');
  // The tick is queued before the request, so a dead signal cannot lose it.
  const toggle = page.slice(page.indexOf('async function toggle'), page.indexOf('function doneFor'));
  assert.ok(toggle.indexOf('queueTick(') < toggle.indexOf('await fetch('), 'the tick is queued after the request, so a failure loses it');
  assert.match(toggle, /clearSent\(/, 'a confirmed tick never leaves the queue');
  assert.match(page, /loadCachedJobs/, 'the page cannot open from a cached list');
  assert.match(page, /clean-link-offline/, 'there is no line saying a tick is unsent');

  /*
   * The service worker is what makes an offline reload possible at all. The old one cached only `/assets/`, so a navigation
   * to `/clean/<token>` had nothing to serve and the browser showed its own offline page.
   */
  const sw = readFileSync(join(root, 'public/sw.js'), 'utf8');
  assert.match(sw, /request\.mode === 'navigate'/, 'the shell is not cached for a navigation');
  assert.match(sw, /url\.pathname\.startsWith\('\/api\/'\)/, 'the worker does not keep the API out of the cache');
  assert.match(sw, /caches\.match\('\/'\)/, 'an offline navigation has no cached shell to fall back to');
  // A POST must never be answered from a cache.
  assert.match(sw, /request\.method !== 'GET'/, 'the worker would serve a write from the cache');
  /*
   * The bundle has to be precached, not cached on first miss. Assets are fetched before the worker controls the page, so the
   * miss branch never sees them — which is why an offline reload served the shell and then failed to mount, a blank page.
   */
  assert.match(sw, /builtAssets/, 'the worker never reads the built asset names from the shell');
  assert.match(sw, /matchAll\(\/\(\?:src\|href\)=/, 'the worker does not extract the bundle from the shell');
  assert.match(sw, /await cache\.addAll\(assets\)/, 'the bundle is not added to the offline cache');
});

test('the service worker parses as plain JavaScript', () => {
  /*
   * The defect this catches, and it would have shipped a dead offline mode: I wrote `Promise<string[]>` and `new Set<string>()`
   * in `public/sw.js`. The file is copied verbatim into the build — Vite does not typecheck it — so TypeScript annotations
   * inside it make the browser refuse to evaluate the worker altogether. `register('/sw.js')` failed with
   * "ServiceWorker script evaluation failed" and the app silently fell back to network-only, which is the state the offline
   * work was supposed to fix.
   *
   * Asserting on the source text would not have caught it; running the parser does.
   */
  const sw = readFileSync(join(root, 'public/sw.js'), 'utf8');
  assert.doesNotThrow(() => new Function(sw), 'public/sw.js is not valid JavaScript, so the browser will not run it');
  // And it must not carry any TypeScript syntax that a copy-paste could reintroduce.
  assert.equal(/Promise<|new Set<|Set<|Array<|: string\b|: void\b/.test(sw), false, 'sw.js carries TypeScript annotations');
});

test('the policies are reachable from both public entry points', () => {
  /*
   * The pages were built and deployed and **nothing linked to them**. A published policy nobody can open is not published,
   * and a guest booking direct was asked to accept terms with no way to read them. This pins the links, and pins the
   * extensionless address: Cloudflare Pages answers `/terms.html` with a 308 to `/terms`, so linking the `.html` form makes
   * every click a redirect.
   */
  const book = readFileSync(join(root, 'src/components/DirectBook.tsx'), 'utf8');
  const houses = readFileSync(join(root, 'src/components/HouseSite.tsx'), 'utf8');
  for (const [name, page] of [['booking page', book], ['house list', houses]] as const) {
    for (const policy of ['/terms', '/privacy', '/accessibility']) {
      assert.match(page, new RegExp(`href="${policy}"`), `the ${name} does not link ${policy}`);
      assert.equal(
        new RegExp(`href="${policy}\\.html"`).test(page),
        false,
        `the ${name} links ${policy}.html, which Pages redirects 308`,
      );
    }
  }
});

test('an owner is read-only and never receives Lindon', async () => {
  const {
    resolveCaller,
    roleFor,
    parseRoleEmails,
    stripHouses,
    allowedHouses,
    mayReadHouse,
    canDo,
    refuseReadOnly,
  } = await import('./../../../functions/_lib/roles.ts');
  const { signSession } = await import('./../../../functions/_lib/email-session.ts');

  const secret = 'a-secret-long-enough-to-sign';
  const ownerEmail = 'todd@example.com';
  const env = {
    SESSION_SECRET: secret,
    ALLOWED_EMAILS: `pmutah@gmail.com,${ownerEmail}`,
    ROLE_EMAILS: `owner=${ownerEmail};cleaner=cleaner@example.com`,
    DASHBOARD_PASSWORD: 'pw',
  };

  // The role is read from the signed session, never from a request field.
  assert.equal(roleFor(ownerEmail, env), 'owner');
  assert.equal(roleFor('pmutah@gmail.com', env), 'admin', 'an unmapped allowlisted address lost admin');
  assert.deepEqual(parseRoleEmails('owner=a@x.com,b@x.com;cleaner=c@x.com'), [
    { email: 'a@x.com', role: 'owner' },
    { email: 'b@x.com', role: 'owner' },
    { email: 'c@x.com', role: 'cleaner' },
  ]);

  const ownerCookie = signSession(ownerEmail, secret);
  const ownerCaller = resolveCaller(
    new Request('https://x/api/expenses', { headers: { Cookie: `wpm_auth=${ownerCookie}` } }),
    env,
  );
  assert.deepEqual(ownerCaller, { kind: 'host', role: 'owner', via: 'email', email: ownerEmail });

  // The shared password is still admin, so the existing way in is unchanged.
  const pwCaller = resolveCaller(
    new Request('https://x/api/expenses', { headers: { Cookie: `wpm_auth=${btoa('wpm:pw').replace(/=+$/, '')}` } }),
    env,
  );
  assert.deepEqual(pwCaller, { kind: 'host', role: 'admin', via: 'password' });
  // And no credential is denied, not admitted.
  assert.equal(resolveCaller(new Request('https://x/api/expenses'), env).kind, 'denied');

  // What the owner may do.
  assert.equal(canDo('owner', 'read-owner'), true);
  assert.equal(canDo('owner', 'edit-expense'), false);
  assert.equal(canDo('owner', 'read-ledger'), false);
  assert.deepEqual(allowedHouses('owner'), ['ranch', 'river']);
  assert.equal(mayReadHouse('owner', 'lindon'), false);
  assert.equal(mayReadHouse('owner', 'ranch'), true);
  assert.equal(allowedHouses('admin'), null, 'an admin was narrowed to a house list');
  assert.equal(mayReadHouse('admin', 'lindon'), true);

  /*
   * The point of the whole module: Lindon must not leave the server. A row with no house is kept — the household ledger is
   * not a house, and dropping it would change a total the owner is reading.
   */
  const rows = [
    { propertyId: 'ranch', amount: 100 },
    { propertyId: 'lindon', amount: 200 },
    { propertyId: 'river', amount: 300 },
    { amount: 400 },
  ];
  const forOwner = stripHouses(rows, 'owner');
  assert.deepEqual(forOwner.map((row) => row.propertyId ?? 'household'), ['ranch', 'river', 'household']);
  assert.equal(forOwner.some((row) => row.propertyId === 'lindon'), false, 'Lindon reached an owner');
  // An admin sees every row, unchanged.
  assert.equal(stripHouses(rows, 'admin').length, 4);

  // A write from an owner is 403 with a reason a client can act on, and not 401.
  const refused = refuseReadOnly(
    new Request('https://x/api/expenses', { headers: { Cookie: `wpm_auth=${ownerCookie}` } }),
    env,
    (req, body, status = 200) => new Response(JSON.stringify(body), { status }),
  );
  assert.ok(refused, 'an owner was allowed to write');
  assert.equal(refused!.status, 403);
  const refusedBody = (await refused!.json()) as { code: string };
  assert.equal(refusedBody.code, 'read-only');
  // An admin is not refused.
  assert.equal(
    refuseReadOnly(new Request('https://x/api/expenses', { headers: { Cookie: `wpm_auth=${btoa('wpm:pw').replace(/=+$/, '')}` } }), env),
    null,
  );
});

test('the role matrix is enforced by the routes that carry the books', () => {
  /*
   * `can()` and `appendAudit()` were defined in `back-office.ts` and **called only from a test** — no route read them, so
   * "Todd sees Ranch and River read-only" was a sentence in a catalog. This pins that the enforcement is in the routes.
   */
  const expenses = readFileSync(join(root, 'functions/api/expenses/index.ts'), 'utf8');
  const expensesItem = readFileSync(join(root, 'functions/api/expenses/[id].ts'), 'utf8');
  const reservations = readFileSync(join(root, 'functions/api/reservations/index.ts'), 'utf8');
  const reservationItem = readFileSync(join(root, 'functions/api/reservations/[id].ts'), 'utf8');
  for (const [name, source] of [['expenses', expenses], ['reservations', reservations]] as const) {
    assert.match(source, /stripHouses\(/, `${name} does not strip a house an owner may not see`);
    assert.match(source, /resolveCaller\(/, `${name} does not resolve the caller's role`);
  }
  /*
   * Every write route that carries the books refuses a read-only account, not just expense create.
   *
   * The defect: `refuseReadOnly` existed and one route called it, so an owner session could still edit or delete an expense
   * and add or change a booking. The middleware now refuses the method for every non-admin session too, but the routes state
   * the rule themselves so a middleware change cannot quietly reopen the ledger.
   */
  for (const [name, source] of [
    ['expense create', expenses],
    ['expense update', expensesItem],
    ['expense delete', expensesItem],
    ['booking create', reservations],
    ['booking update', reservationItem],
  ] as const) {
    assert.match(source, /refuseReadOnly\(/, `${name} does not refuse a read-only account`);
  }
  /*
   * The same defect at the gate that runs first: the middleware only asked "are you signed in", so a role no route checked
   * wrote anything it could reach. It now refuses a non-GET from a read-only session before any route sees it.
   */
  const middleware = readFileSync(join(root, 'functions/_middleware.ts'), 'utf8');
  assert.match(middleware, /refuseReadOnly\(/, 'the first gate does not refuse a read-only write');

  // And the matrix itself still says what the plan says.
  const backOffice = readFileSync(join(root, 'src/lib/platform/back-office.ts'), 'utf8');
  assert.match(backOffice, /owner: \['read-owner'\]/, 'the owner role stopped being read-only');
});

test('a read-only session cannot write on any route, and an admin still can', async () => {
  /*
   * The defect this proves gone: `refuseReadOnly` was called by one route (expense create), so an owner session could PATCH
   * or DELETE an expense and add or change a booking. The gate that runs first now refuses the method, so a route added next
   * year is covered without having to know about roles at all.
   */
  const { signSession } = await import('./../../../functions/_lib/email-session.ts');
  const secret = 'a-secret-long-enough-to-sign';
  const ownerEmail = 'todd@example.com';
  const env = {
    SESSION_SECRET: secret,
    ALLOWED_EMAILS: `pmutah@gmail.com,${ownerEmail}`,
    ROLE_EMAILS: `owner=${ownerEmail}`,
    DASHBOARD_PASSWORD: 'pw',
  };
  const ownerCookie = signSession(ownerEmail, secret);
  const adminCookie = signSession('pmutah@gmail.com', secret);

  const call = async (method: string, cookie: string, path = '/api/expenses/exp-1') => {
    let reached = false;
    const request = new Request(`https://x${path}`, { method, headers: { Cookie: `wpm_auth=${cookie}` } });
    const response = (await middleware({
      request,
      env,
      params: {},
      // A route that would have written. If the gate lets the call through, this sets the flag.
      next: async () => {
        reached = true;
        return new Response(JSON.stringify({ reachedRoute: true }), { status: 200 });
      },
      data: {},
      waitUntil: () => {},
      passThroughOnException: () => {},
    } as never)) as Response;
    return { status: response.status, reached, body: (await response.json().catch(() => ({}))) as Record<string, unknown> };
  };

  for (const method of ['POST', 'PATCH', 'DELETE', 'PUT']) {
    const owner = await call(method, ownerCookie);
    assert.equal(owner.status, 403, `an owner ${method} was not refused`);
    assert.equal(owner.body.code, 'read-only', `an owner ${method} was refused without saying why`);
    assert.equal(owner.reached, false, `an owner ${method} reached the route`);
    // The same method from an admin still reaches the route. Nothing was narrowed for the person who owns the books.
    const admin = await call(method, adminCookie);
    assert.equal(admin.reached, true, `an admin ${method} was stopped by the read-only gate`);
    assert.equal(admin.status, 200);
  }

  // Reads from an owner still pass, which is the whole point of a read-only role.
  for (const method of ['GET', 'HEAD']) {
    const owner = await call(method, ownerCookie);
    assert.equal(owner.reached, true, `an owner ${method} was refused a read`);
  }
  // And a guest path is not reached by the gate at all.
  const publicRoute = await call('POST', '', '/api/book');
  assert.equal(publicRoute.status, 200, 'a public booking request was refused by the middleware');
});

test('the audit log actually records a change, and refuses a bulk delete', async () => {
  const { audit, readAudit, auditLine, isBulkDelete, AUDIT_LIMIT } = await import('./../../../functions/_lib/platform/audit-store.ts');
  /*
   * The defect: `appendAudit` in `back-office.ts` was called only from a test, and no route wrote an entry. "Every change is
   * logged" was a rule with no writer — the same shape as the kill switch and the change log.
   */
  const kv = (() => {
    const map = new Map<string, string>();
    return {
      get: async (key: string) => map.get(key) ?? null,
      put: async (key: string, value: string) => void map.set(key, value),
      raw: map,
    };
  })();
  const env = { SETTINGS: kv } as never;

  assert.equal(isBulkDelete('delete-expenses'), true);
  assert.equal(isBulkDelete('bulk-delete'), true);
  assert.equal(isBulkDelete('expense.remove'), false, 'an ordinary removal was treated as a bulk delete');

  // A bulk delete is refused and writes nothing.
  const refused = await audit(env, { actor: { role: 'admin' }, action: 'delete-reservations', target: 'all' });
  assert.equal(refused.ok, false);
  assert.equal(kv.raw.has('auditLog'), false, 'a refused action still wrote the log');

  // A real change is written with the actor and the row.
  const written = await audit(env, {
    actor: { role: 'owner', email: 'todd@example.com' },
    action: 'expense.remove',
    target: 'exp-123',
    note: 'Archived and restorable.',
  });
  assert.equal(written.ok, true);
  const stored = JSON.parse(kv.raw.get('auditLog')!) as unknown[];
  assert.equal(stored.length, 1);

  const read = await readAudit(env, 10);
  assert.equal(read.ok, true);
  const entries = read.ok ? read.entries : [];
  assert.equal(entries.length, 1);
  assert.equal(entries[0]!.action, 'expense.remove');
  assert.equal(entries[0]!.target, 'exp-123');
  assert.equal(entries[0]!.actor.email, 'todd@example.com');

  // The line names the actor and the row, and does not repeat an amount.
  const line = auditLine(entries[0]!);
  assert.match(line, /owner todd@example\.com/);
  assert.match(line, /expense\.remove on exp-123/);
  assert.equal(/\$\d/.test(line), false, 'the audit line carries a money figure');

  // Newest first.
  await audit(env, { actor: { role: 'admin' }, action: 'expense.update', target: 'exp-456' });
  const two = await readAudit(env, 10);
  assert.equal(two.ok && two.entries[0]!.target, 'exp-456', 'the log is not newest first');

  // A failed read is reported, never rendered as an empty log.
  const broken = { SETTINGS: { get: async () => { throw new Error('KV GET limit exceeded'); }, put: async () => {} } } as never;
  const brokenRead = await readAudit(broken, 10);
  assert.equal(brokenRead.ok, false);
  assert.match(brokenRead.ok === false ? brokenRead.reason : '', /could not be read/);
  const brokenWrite = await audit(broken, { actor: { role: 'admin' }, action: 'expense.update', target: 'x' });
  assert.equal(brokenWrite.ok, false);

  // The cap drops the oldest, and it is bounded.
  assert.ok(AUDIT_LIMIT >= 100 && AUDIT_LIMIT <= 20000);

  /*
   * And the routes that carry the books actually call it. A store with no caller is the defect this whole test exists for.
   */
  const expenseRoute = readFileSync(join(root, 'functions/api/expenses/[id].ts'), 'utf8');
  assert.match(expenseRoute, /await audit\(env,/, 'the expense route does not record a change');
  assert.match(expenseRoute, /action: 'expense\.remove'/, 'a removal is not recorded');
  assert.match(expenseRoute, /action: 'expense\.update'/, 'an edit is not recorded');
  const auditRoute = readFileSync(join(root, 'functions/api/platform/audit.ts'), 'utf8');
  assert.match(auditRoute, /readAudit\(/, 'nothing exposes the audit log');
});

test('no Worker module reaches for a Node built-in at runtime', () => {
  /*
   * The defect this exists for, measured on a running Pages runtime: `email-session.ts` used `Buffer.from(...)`, and
   * `Buffer` does not exist at `compatibility_date = 2024-12-01` without `nodejs_compat`. Wrangler's bundler did not
   * complain — it left `Buffer` as a bare global reference that throws on use.
   *
   * The consequence was not a broken page. `hostOnly` treats a throw as "not authenticated", so every request carrying an
   * emailed session was refused **401**, which meant Google sign-in never worked in production from the day it shipped: the
   * login screen offered it, the token verified, the cookie was set, and the next request denied it. The password path kept
   * working, which is why nobody noticed.
   *
   * A grep is the right tool here because the failure is invisible to the type checker (the `node` types are present in
   * `tsconfig.functions.json`) and to the bundler.
   */
  const root = join(process.cwd(), 'functions');
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.ts$/.test(entry.name) || /\.test\.ts$/.test(entry.name)) continue;
      const text = readFileSync(full, 'utf8');
      // Strip comments so the explanation above does not trip its own guard.
      const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      if (/\bBuffer\s*[.(]/.test(code) || /\brequire\s*\(/.test(code) || /from 'node:/.test(code)) {
        offenders.push(relative(process.cwd(), full).replace(/\\/g, '/'));
      }
    }
  };
  walk(root);
  assert.deepEqual(offenders, [], 'these Worker modules use a Node built-in that does not exist at this compatibility date');
});

test('the market database refuses a missing binding instead of pretending it saved', async () => {
  const { funnelIsValid, marketDb, readRows, writeRow } = await import('../../../functions/_lib/platform/market-db.ts');
  assert.equal(marketDb({}), null);
  assert.equal(funnelIsValid({ step: 'view', house: 'ranch' }), true);
  assert.equal(funnelIsValid({ step: 'refund', house: 'ranch' }), false);
  assert.equal(funnelIsValid({ step: 'view', house: 'lindon', visit: 'short' }), false);
  const read = await readRows({}, 'SELECT 1');
  assert.equal(read.ok, false);
  const write = await writeRow({}, 'INSERT INTO funnel_events (step, house, created_at) VALUES (?, ?, ?)', 'view', 'ranch', 'now');
  assert.equal(write.ok, false);
});
