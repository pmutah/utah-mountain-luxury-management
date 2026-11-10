/**
 * The rate-publishing switch, and the thing it must never do by accident.
 *
 * The owner asked for the sender to exist with a host-controlled switch, **left off** (2026-11-10). So the tests here are
 * mostly about the off state: a switch that closes by accident is fine, and one that opens by accident publishes prices to
 * live listings.
 *
 * The other half is the unit. Hospitable's calendar takes `price: { amount }` and the reference does not say whether that is
 * cents or dollars — sending the wrong one prices every night 100 times too high or too low. So the unit is never defaulted,
 * and a missing unit refuses.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { publishApprovedRates, publishSwitch } from './market/rate-publish.ts';
import { hospitableMissing, hospitablePropertyFor } from './market/hospitable-properties.ts';

const TOKEN = 'test-pat-not-real';

test('the switch is off when nothing is set', () => {
  const gate = publishSwitch({});
  assert.equal(gate.on, false);
  assert.match(gate.line, /no Hospitable token/, 'the reason does not name the missing token');
});

test('a token alone does not turn it on', () => {
  // The switch is separate from the credential on purpose: having a token must never mean publishing.
  const gate = publishSwitch({ HOSPITABLE_PAT: TOKEN });
  assert.equal(gate.on, false);
  assert.match(gate.line, /switch is not on/, 'the reason does not name the switch');
});

test('only the word on turns it on, whatever its case or padding', () => {
  /*
   * `ON `, `On`, and `on` all mean on — case and surrounding space are trimmed, which is friendlier than rejecting a typed
   * value over a stray space. Every *other* word is off, because a switch that opens on a near-miss is how a price reaches a
   * live listing by accident.
   */
  for (const value of ['ON', 'On', ' on ', 'ON ']) {
    const gate = publishSwitch({ HOSPITABLE_PAT: TOKEN, HOSPITABLE_RATE_PUSH: value, HOSPITABLE_PRICE_UNIT: 'cents' });
    assert.equal(gate.on, true, `"${value}" should be read as on`);
  }
  for (const value of ['yes', 'true', '1', 'enabled', '', 'on!', 'onn', 'off']) {
    const gate = publishSwitch({ HOSPITABLE_PAT: TOKEN, HOSPITABLE_RATE_PUSH: value, HOSPITABLE_PRICE_UNIT: 'cents' });
    assert.equal(gate.on, false, `"${value}" turned the switch on`);
  }
});

test('the switch on without a unit is still off', () => {
  // There is no default unit, because the wrong one is a 100x error on a live listing.
  const gate = publishSwitch({ HOSPITABLE_PAT: TOKEN, HOSPITABLE_RATE_PUSH: 'on' });
  assert.equal(gate.on, false);
  assert.match(gate.line, /PRICE_UNIT must be/, 'the reason does not name the missing unit');
});

test('all three conditions turn it on, and the line says what it does not do', () => {
  const gate = publishSwitch({ HOSPITABLE_PAT: TOKEN, HOSPITABLE_RATE_PUSH: 'on', HOSPITABLE_PRICE_UNIT: 'cents' });
  assert.equal(gate.on, true);
  assert.equal(gate.unit, 'cents');
  // The doctrine point, stated wherever the switch is described.
  assert.match(gate.line, /Airbnb or VRBO/, 'the line does not say a promotion badge still has to be typed elsewhere');
});

test('sending refuses while the switch is off, before any request', async () => {
  let called = false;
  const spy = (async () => {
    called = true;
    return new Response('{}', { status: 200 });
  }) as unknown as typeof fetch;

  const out = await publishApprovedRates({ HOSPITABLE_PAT: TOKEN }, [{ listing: 'river', date: '2027-03-01', rate: 2400 }], spy);
  assert.equal(out.ok, false);
  assert.equal(out.sent.length, 0, 'a night was sent with the switch off');
  assert.equal(called, false, 'a request went out with the switch off');
  assert.match(out.line, /off/, 'the refusal does not say it is off');
});

test('the Ranch is refused, because this Hospitable account has no Ranch property', () => {
  // The owner confirmed the Ranch is not in the account. A guessed uuid would write to a stranger's calendar.
  assert.equal(hospitablePropertyFor('ranch'), null);
  assert.deepEqual(hospitableMissing(), ['ranch']);
});

test('every other listing has exactly one uuid', () => {
  for (const listing of ['river', 'lindon', 'main-lodge', 'recreation-wing', 'garage-suite'] as const) {
    const uuid = hospitablePropertyFor(listing);
    assert.ok(uuid, `${listing} has no Hospitable property`);
    assert.match(uuid!, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, `${listing} uuid is not a uuid`);
  }
});

test('a Ranch night is refused while the others are batched', async () => {
  const bodies: unknown[] = [];
  const spy = (async (_url: string, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)));
    return new Response('{}', { status: 202 });
  }) as unknown as typeof fetch;

  const out = await publishApprovedRates(
    { HOSPITABLE_PAT: TOKEN, HOSPITABLE_RATE_PUSH: 'on', HOSPITABLE_PRICE_UNIT: 'cents' },
    [
      { listing: 'river', date: '2027-03-01', rate: 2400 },
      { listing: 'ranch', date: '2027-03-01', rate: 500 },
    ],
    spy,
  );
  assert.ok(out.sent.some((row) => row.dates === 1), 'the River night was not sent');
  const refusedRanch = out.refused.find((row) => row.listing === 'ranch');
  assert.ok(refusedRanch, 'the Ranch night was not refused');
  assert.match(refusedRanch!.why, /not a property in this Hospitable account/);
  assert.equal(bodies.length, 1, 'a batch was sent for the refused Ranch night');
});

test('a rate that is not a whole number of cents is refused in cents mode', async () => {
  // $2160.405 cannot be represented, and rounding it silently is how a price drifts.
  const spy = (async () => new Response('{}', { status: 202 })) as unknown as typeof fetch;
  const out = await publishApprovedRates(
    { HOSPITABLE_PAT: TOKEN, HOSPITABLE_RATE_PUSH: 'on', HOSPITABLE_PRICE_UNIT: 'cents' },
    [{ listing: 'river', date: '2027-03-01', rate: 2160.405 }],
    spy,
  );
  assert.equal(out.sent.length, 0, 'an unrepresentable rate was sent');
  assert.match(out.refused[0]!.why, /whole number of cents/);
});

test('a failed send says nothing was published', async () => {
  const spy = (async () => new Response('{}', { status: 401 })) as unknown as typeof fetch;
  const out = await publishApprovedRates(
    { HOSPITABLE_PAT: TOKEN, HOSPITABLE_RATE_PUSH: 'on', HOSPITABLE_PRICE_UNIT: 'dollars' },
    [{ listing: 'river', date: '2027-03-01', rate: 2400 }],
    spy,
  );
  assert.equal(out.ok, false);
  assert.equal(out.sent.length, 0, 'a failed request was reported as sent');
  assert.match(out.refused[0]!.why, /401/);
});

test('dollars mode sends whole dollars', async () => {
  const bodies: Array<{ dates: Array<{ price: { amount: number } }> }> = [];
  const spy = (async (_url: string, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)));
    return new Response('{}', { status: 202 });
  }) as unknown as typeof fetch;

  await publishApprovedRates(
    { HOSPITABLE_PAT: TOKEN, HOSPITABLE_RATE_PUSH: 'on', HOSPITABLE_PRICE_UNIT: 'dollars' },
    [{ listing: 'river', date: '2027-03-01', rate: 2400 }],
    spy,
  );
  assert.equal(bodies[0]!.dates[0]!.price.amount, 2400, 'the dollar amount was not sent as dollars');
});

test('cents mode sends cents', async () => {
  const bodies: Array<{ dates: Array<{ price: { amount: number } }> }> = [];
  const spy = (async (_url: string, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)));
    return new Response('{}', { status: 202 });
  }) as unknown as typeof fetch;

  await publishApprovedRates(
    { HOSPITABLE_PAT: TOKEN, HOSPITABLE_RATE_PUSH: 'on', HOSPITABLE_PRICE_UNIT: 'cents' },
    [{ listing: 'river', date: '2027-03-01', rate: 24 }],
    spy,
  );
  assert.equal(bodies[0]!.dates[0]!.price.amount, 2400, 'the cent amount was not sent as cents');
});
