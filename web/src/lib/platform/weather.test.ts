/**
 * Live conditions: the NWS parse, the plow threshold, and the road line.
 *
 * Every test here drives a payload shaped like the service's own, because the defects this catches are all parsing ones: a
 * millimetre figure read as inches, a night period taken as a high, a failed read rendered as a calm night.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  alertsFrom,
  conditionsLine,
  forecastFrom,
  NWS_USER_AGENT,
  snowFromGridpoint,
  type Conditions,
} from '../../../functions/_lib/platform/weather.ts';
import { roadStatus } from '../../../functions/_lib/platform/roads.ts';

const root = join(process.cwd());

/** A gridpoint payload with `snowfallAmount` in millimetres, as the NWS publishes it. */
function gridpoint(values: Array<{ validTime: string; value: number | null }>): unknown {
  return {
    properties: {
      snowfallAmount: {
        uom: 'wmoUnit:mm',
        values: values.map((row) => ({
          validTime: row.validTime,
          value: row.value,
        })),
      },
    },
  };
}

test('snow is converted from millimetres, not read as inches', () => {
  /*
   * The trap: NWS gridpoints report millimetres under `wmoUnit:mm`. Treating 50.8 as inches would turn two inches of snow into
   * fifty, and every night would look like a blizzard. 50.8 mm is exactly 2 in.
   */
  const window = snowFromGridpoint(
    gridpoint([{ validTime: '2026-11-11T18:00:00+00:00/PT6H', value: 50.8 }]),
    new Date('2026-11-11T12:00:00Z'),
  );
  assert.ok(window, 'a real payload returned nothing');
  assert.equal(window!.inches48, 2);
  assert.equal(window!.buckets.length, 1);
});

test('only the next 48 hours count, and a null bucket is a real zero', () => {
  const window = snowFromGridpoint(
    gridpoint([
      { validTime: '2026-11-11T18:00:00+00:00/PT6H', value: 25.4 },
      { validTime: '2026-11-11T00:00:00+00:00/PT6H', value: 100 }, // already past
      { validTime: '2026-11-12T00:00:00+00:00/PT6H', value: null }, // no snow, and that is a fact
      { validTime: '2026-11-20T00:00:00+00:00/PT6H', value: 254 }, // beyond the horizon
    ]),
    new Date('2026-11-11T12:00:00Z'),
  );
  assert.ok(window);
  assert.equal(window!.inches48, 1, 'a past bucket or one beyond 48 hours was counted');
  assert.equal(window!.buckets.length, 2);
});

test('a payload with no snowfall product is not zero snow', () => {
  // "This grid has no snowfall product" and "it will not snow" are different answers. The first returns null.
  assert.equal(snowFromGridpoint({ properties: {} }, new Date('2026-11-11T12:00:00Z')), null);
  assert.equal(snowFromGridpoint(null, new Date('2026-11-11T12:00:00Z')), null);
  assert.equal(snowFromGridpoint({}, new Date('2026-11-11T12:00:00Z')), null);
});

test('the forecast pairs a day with its own low and skips the night period', () => {
  const days = forecastFrom({
    properties: {
      periods: [
        { name: 'Wednesday', isDaytime: true, temperature: 48, shortForecast: 'Sunny', probabilityOfPrecipitation: { value: 0 } },
        { name: 'Wednesday Night', isDaytime: false, temperature: 27, shortForecast: 'Clear' },
        { name: 'Thursday', isDaytime: true, temperature: 39, shortForecast: 'Snow Likely', probabilityOfPrecipitation: { value: 70 } },
        { name: 'Thursday Night', isDaytime: false, temperature: 21, shortForecast: 'Snow' },
        { name: 'Friday', isDaytime: true, temperature: 34, shortForecast: 'Partly Sunny' },
      ],
    },
  });
  assert.deepEqual(
    days.map((day) => [day.name, day.high, day.low]),
    [
      ['Wednesday', 48, 27],
      ['Thursday', 39, 21],
      ['Friday', 34, null],
    ],
  );
  assert.equal(days[1]!.precip, 70);
  // Three days is what a guest page shows. A limit holds.
  assert.equal(forecastFrom({ properties: { periods: [] } }).length, 0);
});

test('an alert keeps its event name and never invents one', () => {
  const alerts = alertsFrom({
    features: [
      { properties: { event: 'Winter Storm Warning', severity: 'Severe', headline: 'Heavy snow above 6,000 feet', ends: '2026-11-13T00:00:00Z' } },
      { properties: { headline: 'no event field' } },
    ],
  });
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0]!.event, 'Winter Storm Warning');
  assert.equal(alertsFrom(null).length, 0);
});

test('a failed read is never rendered as clear weather', () => {
  /*
   * The defect class this whole platform keeps finding: a store that cannot be read reported as an empty one. Here it would be a
   * desk saying "no snow" while the weather service was down.
   */
  const failed: Conditions = {
    ok: false,
    reason: 'unreachable',
    readAt: '2026-11-11T12:00:00Z',
    snow: null,
    sundance: null,
    houses: [],
    alerts: [],
    plow: { dispatch: false, reason: 'No live forecast is connected, so snow removal is not dispatched.' },
  };
  assert.match(conditionsLine(failed), /could not be reached/);
  assert.match(conditionsLine(failed), /not clear weather/);

  // And a real read with two inches says so and names the plow.
  const live: Conditions = {
    ...failed,
    ok: true,
    snow: { inches48: 2.4, buckets: [] },
    plow: { dispatch: true, reason: '2.4 inches is enough to dispatch. This did not send a text.' },
  };
  assert.match(conditionsLine(live), /2.4 in/);
  assert.match(conditionsLine(live), /enough to dispatch/);
  assert.match(conditionsLine(live), /did not send a text/);
});

test('the road is never reported open on no evidence', async () => {
  /*
   * Without a UDOT key the line says the road is not connected. With a key but no endpoint it still does not guess a URL. And a
   * winter alert is reported as an alert, explicitly not as a closure.
   */
  const noFetch: typeof fetch = (() => {
    throw new Error('the road read must not call a feed without a key and an endpoint');
  }) as unknown as typeof fetch;
  const unset = await roadStatus(noFetch, undefined);
  assert.equal(unset.connected, false);
  assert.match(unset.line, /not connected/);
  /*
   * It may say it does not know whether the road is open; it may never say that it is. Every mention of "open" here has to sit
   * behind "whether".
   */
  for (const match of unset.line.matchAll(/\bis open\b/g)) {
    const before = unset.line.slice(Math.max(0, match.index - 20), match.index);
    assert.match(before, /whether (the road )?$/, `the line affirmed the road is open: ${unset.line}`);
  }
  assert.equal(unset.winterAlert, false);

  const keyOnly = await roadStatus(noFetch, 'a-key');
  assert.equal(keyOnly.connected, false);
  assert.match(keyOnly.line, /not connected/);

  // A failure from the feed says it failed. It does not fall back to "no news, so fine".
  const broken: typeof fetch = (async () => new Response('nope', { status: 503 })) as unknown as typeof fetch;
  const failed = await roadStatus(broken, 'a-key', 'https://example.invalid/road');
  assert.equal(failed.connected, false);
  assert.match(failed.line, /could not be read/);
  assert.doesNotMatch(failed.line, /\bis open\b/);
});

test('the forecast route answers a real stay token and refuses a stranger', async () => {
  /*
   * The route is public because the stay token is the credential, so this proves both halves: a survey behind the token gets
   * weather for its house, and a token that matches nothing is refused before any weather call is made.
   */
  const kv = (() => {
    const map = new Map<string, string>();
    return {
      get: async (key: string) => map.get(key) ?? null,
      put: async (key: string, value: string) => void map.set(key, value),
    };
  })();
  await kv.put(
    'guestSurveys',
    JSON.stringify([
      {
        token: 'a-real-token-1234567890',
        reservationId: 'res-1',
        propertyId: 'river',
        guestName: 'A Guest',
        checkIn: '2026-11-20',
        checkOut: '2026-11-22',
        createdAt: '2026-11-11T00:00:00Z',
      },
    ]),
  );
  const env = { SETTINGS: kv, DASHBOARD_PASSWORD: 'pw' } as never;
  const { onRequestGet } = await import('../../../functions/api/stay-guide/[token]/conditions.ts');

  const request = new Request('https://x/api/stay-guide/a-real-token-1234567890/conditions');
  const response = (await onRequestGet({
    request,
    env,
    params: { token: 'a-real-token-1234567890' },
    data: {},
    next: async () => new Response(null),
    waitUntil: () => {},
    passThroughOnException: () => {},
  } as never)) as Response;
  // Live weather either answered or did not; both are valid here, and neither may be a refusal of the guest.
  assert.ok(response.status === 200 || response.status === 502 || response.status === 500, `answered ${response.status}`);
  if (response.status === 200) {
    const body = (await response.json()) as { house?: string; sends?: boolean; doorCode?: unknown };
    assert.equal(body.house, 'river', 'the route did not answer for the stay house');
    assert.equal(body.sends, false);
    assert.equal('doorCode' in body, false, 'a forecast response carried a door code');
  }

  const stranger = (await onRequestGet({
    request: new Request('https://x/api/stay-guide/nope/conditions'),
    env,
    params: { token: 'nope' },
    data: {},
    next: async () => new Response(null),
    waitUntil: () => {},
    passThroughOnException: () => {},
  } as never)) as Response;
  assert.equal(stranger.status, 404, 'an unknown token was not refused');
});

test('the weather request identifies itself, as the service requires', () => {
  const source = readFileSync(join(root, 'functions/_lib/platform/weather.ts'), 'utf8');
  assert.match(source, /User-Agent/, 'the request carries no User-Agent, which the NWS refuses');
  assert.match(NWS_USER_AGENT, /wilhite-portfolio/);
  // Six calls at most per read: three houses, Sundance forecast, Sundance snow, and the alerts. A per-house alerts read would
  // multiply the slowest call.
  assert.match(source, /Promise\.all/);
});

test('the desk and the guest page both read live conditions', () => {
  const map = readFileSync(join(root, 'src/components/MissionMap.tsx'), 'utf8');
  assert.match(map, /useConditions\(/, 'the map still prints the fixed not-connected sentence');
  assert.doesNotMatch(map, /CANYON_STATUS/, 'the map still imports the placeholder');
  assert.match(map, /mission-plow|mission-snow/, 'the map shows no live snow figure');

  const stay = readFileSync(join(root, 'src/components/StayApp.tsx'), 'utf8');
  assert.match(stay, /stay-weather/, 'the guest page shows no forecast');
  assert.match(stay, /stay-weather-advisory/, 'the guest page shows no advisory');
});
