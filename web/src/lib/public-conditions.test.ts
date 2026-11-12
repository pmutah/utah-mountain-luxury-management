import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPublicConditions,
  clearPublicConditionsCache,
  onRequestGet,
} from '../../functions/api/public/conditions.ts';
import { onRequest as middleware } from '../../functions/_middleware.ts';
import { formatDayPill, formatRiverBadge, formatSundanceBadge } from './public-conditions.ts';
import { appleDirectionsUrl, CANYON_PINS, googleDirectionsUrl, pinsFor, TRAVEL_ORIGINS } from './canyon-map.ts';

test('a failed NWS and USGS read returns ok:false and never claims clear weather or an open road', async () => {
  clearPublicConditionsCache();
  const offlineFetch = (async () => {
    throw new Error('network down');
  }) as unknown as typeof fetch;

  const payload = await buildPublicConditions(offlineFetch, new Date('2026-11-12T18:00:00Z'));
  assert.equal(payload.ok, false);
  assert.equal(payload.river.ok, false);
  assert.equal(payload.sends, false);
  assert.equal(/clear weather|road is open/i.test(JSON.stringify(payload)), false);
});

test('public conditions parses NWS forecast, 48h Sundance snow, winter alert, and USGS Vivian Park river flow', async () => {
  clearPublicConditionsCache();
  const now = new Date('2026-11-12T18:00:00Z');
  const mockFetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('waterservices.usgs.gov')) {
      return new Response(
        JSON.stringify({
          value: {
            timeSeries: [
              {
                variable: { variableCode: [{ value: '00060' }] },
                values: [{ value: [{ value: '185', dateTime: '2026-11-12T17:45:00Z' }] }],
              },
              {
                variable: { variableCode: [{ value: '00010' }] },
                values: [{ value: [{ value: '10', dateTime: '2026-11-12T17:45:00Z' }] }],
              },
            ],
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (url.includes('/points/')) {
      return new Response(
        JSON.stringify({
          properties: {
            forecast: 'https://api.weather.gov/gridpoints/SLC/100,100/forecast',
            forecastGridData: 'https://api.weather.gov/gridpoints/SLC/100,100',
          },
        }),
        { status: 200 },
      );
    }
    if (url.endsWith('/forecast')) {
      return new Response(
        JSON.stringify({
          properties: {
            periods: [
              { name: 'Thursday', isDaytime: true, temperature: 52, shortForecast: 'Sunny', probabilityOfPrecipitation: { value: 10 } },
              { name: 'Thursday Night', isDaytime: false, temperature: 31, shortForecast: 'Mostly Clear', probabilityOfPrecipitation: { value: 10 } },
            ],
          },
        }),
        { status: 200 },
      );
    }
    if (url.includes('/alerts/active')) {
      return new Response(
        JSON.stringify({
          features: [
            {
              properties: {
                event: 'Winter Weather Advisory',
                severity: 'Moderate',
                headline: 'Snow expected above 6,000 feet',
                ends: '2026-11-13T12:00:00Z',
              },
            },
          ],
        }),
        { status: 200 },
      );
    }
    // Grid data with 50.8 mm (2.0 inches) snow
    return new Response(
      JSON.stringify({
        properties: {
          snowfallAmount: {
            values: [{ validTime: '2026-11-12T18:00:00+00:00/PT6H', value: 50.8 }],
          },
        },
      }),
      { status: 200 },
    );
  }) as typeof fetch;

  const payload = await buildPublicConditions(mockFetch, now);
  assert.equal(payload.ok, true);
  assert.equal(payload.sundance?.snow48, 2);
  assert.equal(payload.river.ok, true);
  if (payload.river.ok) {
    assert.equal(payload.river.cfs, 185);
    assert.equal(payload.river.tempF, 50);
    assert.equal(payload.river.state, 'prime');
  }
  assert.match(payload.advisory, /Winter Weather Advisory/);
  assert.match(payload.advisory, /UDOT/);
  assert.equal(formatDayPill(payload.houses[0]?.days[0]), 'Thursday · 52°/31°F · Sunny');
  assert.match(formatSundanceBadge(payload.sundance), /2" snow next 48h/);
  assert.match(formatRiverBadge(payload.river), /185 cfs · 50°F water · Prime wading/);
});

test('/api/public/conditions passes through _middleware without a host cookie', async () => {
  let reached = false;
  const res = (await middleware({
    request: new Request('https://wilhite-portfolio.pages.dev/api/public/conditions'),
    env: { DASHBOARD_PASSWORD: 'secret-password' },
    params: {},
    next: async () => {
      reached = true;
      return onRequestGet({
        request: new Request('https://wilhite-portfolio.pages.dev/api/public/conditions'),
        env: {},
        params: {},
      } as never);
    },
    data: {},
    waitUntil: () => {},
    passThroughOnException: () => {},
  } as never)) as Response;

  assert.equal(reached, true, 'middleware blocked public conditions without a host cookie');
  assert.equal(res.status, 200);
});

test('canyon map pins, airport origins, and directions links carry valid coordinates and no secrets', () => {
  assert.ok(CANYON_PINS.length >= 6);
  const skiPins = pinsFor('ski');
  assert.ok(skiPins.some((p) => p.id === 'sundance'));
  assert.ok(skiPins.some((p) => p.kind === 'house'));

  for (const origin of TRAVEL_ORIGINS) {
    assert.ok(origin.minutesTo.river > 0);
    assert.ok(origin.milesTo.ranch > 0);
  }

  const gUrl = googleDirectionsUrl('Salt Lake City International Airport, UT', 'Vivian Park, Provo Canyon, UT 84604');
  const aUrl = appleDirectionsUrl('Salt Lake City International Airport, UT', 'Vivian Park, Provo Canyon, UT 84604');
  assert.match(gUrl, /^https:\/\/www\.google\.com\/maps\/dir\/\?/);
  assert.match(aUrl, /^https:\/\/maps\.apple\.com\/\?/);
});
