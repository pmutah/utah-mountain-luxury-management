import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  UTAH_RESORTS,
  buildSnowReport,
  deepestLastDay,
  forecastUrl,
  inchesText,
  snowByRegion,
  snowDateLabel,
  snowHeadline,
} from './snow-report.ts';
import { loadPublicSnow, resetPublicSnowClientCache, snowUpdatedLabel } from './public-snow.ts';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');

/** One Open-Meteo point with a week behind it and four days ahead. */
function point(cmByDay: Record<string, number>) {
  const time = Object.keys(cmByDay);
  return { daily: { time, snowfall_sum: time.map((day) => cmByDay[day]) } };
}

const WEEK = {
  '2026-11-05': 0,
  '2026-11-06': 2.54,
  '2026-11-07': 0,
  '2026-11-08': 5.08,
  '2026-11-09': 0,
  '2026-11-10': 0,
  '2026-11-11': 10.16,
  '2026-11-12': 0,
  '2026-11-13': 20.32,
  '2026-11-14': 0,
  '2026-11-15': 0,
};

test('every resort on the official Utah list is present, with a real report link and no duplicate key', () => {
  assert.equal(UTAH_RESORTS.length, 16);
  const keys = UTAH_RESORTS.map((resort) => resort.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const resort of UTAH_RESORTS) {
    assert.match(resort.reportUrl, /^https:\/\//, `${resort.key} has no report link`);
    assert.ok(resort.lat > 36 && resort.lat < 43, `${resort.key} latitude is not in Utah`);
    assert.ok(resort.lon < -111 && resort.lon > -113.5, `${resort.key} longitude is not in Utah`);
    assert.ok(resort.elevationFt > 5000 && resort.elevationFt < 12000, `${resort.key} elevation looks wrong`);
  }
  // The resort ten minutes from the house has to be first and in its own region.
  assert.equal(UTAH_RESORTS[0]!.key, 'sundance');
  assert.equal(UTAH_RESORTS[0]!.region, 'Provo Canyon');
  for (const name of ['Alta', 'Snowbird', 'Brighton', 'Solitude', 'Park City Mountain', 'Deer Valley', 'Snowbasin', 'Powder Mountain', 'Brian Head']) {
    assert.ok(UTAH_RESORTS.some((resort) => resort.name === name), `${name} is missing from the list`);
  }
});

test('one request carries every resort, with past days and a short forecast, in Mountain Time', () => {
  const url = new URL(forecastUrl());
  assert.equal(url.origin + url.pathname, 'https://api.open-meteo.com/v1/forecast');
  assert.equal(url.searchParams.get('daily'), 'snowfall_sum');
  assert.equal(url.searchParams.get('timezone'), 'America/Denver');
  assert.equal(url.searchParams.get('past_days'), '7');
  assert.equal(url.searchParams.get('forecast_days'), '4');
  assert.equal(url.searchParams.get('latitude')!.split(',').length, 16);
  assert.equal(url.searchParams.get('longitude')!.split(',').length, 16);
  assert.equal(/api[_-]?key|apikey|token=/i.test(url.toString()), false, 'the forecast URL must stay keyless');
});

test('centimetres become inches, past and future split on today, and last day is the most recent past day', () => {
  const rows = buildSnowReport([point(WEEK)], [UTAH_RESORTS[0]!], '2026-11-12');
  assert.equal(rows.length, 1);
  const row = rows[0]!;
  assert.equal(row.past.length, 7);
  assert.equal(row.ahead.length, 4);
  // 10.16 cm is exactly 4 inches, 5.08 is 2, 2.54 is 1.
  assert.equal(row.lastDay, 4);
  assert.equal(row.pastTotal, 7);
  assert.equal(row.aheadTotal, 8);
  assert.deepEqual(
    row.past.map((day) => day.inches),
    [0, 1, 0, 2, 0, 0, 4],
  );
  assert.equal(row.ahead[0]!.date, '2026-11-12');
  assert.equal(row.ahead[0]!.inches, 0);
  assert.equal(row.ahead[1]!.inches, 8);
});

test('a resort the read did not answer for is left out, never drawn as zero snow', () => {
  const two = [UTAH_RESORTS[0]!, UTAH_RESORTS[1]!];
  const rows = buildSnowReport([point(WEEK), { daily: { time: [], snowfall_sum: [] } }], two, '2026-11-12');
  assert.equal(rows.length, 1, 'an empty point must not become a zero row');
  assert.equal(rows[0]!.key, 'sundance');
  // A null value inside an otherwise good series is skipped, not counted as zero.
  const withHole = { daily: { time: ['2026-11-10', '2026-11-11'], snowfall_sum: [null, 2.54] } };
  const holed = buildSnowReport([withHole], [UTAH_RESORTS[0]!], '2026-11-12');
  assert.equal(holed[0]!.past.length, 1);
  assert.equal(holed[0]!.pastTotal, 1);
  // A payload that is not shaped like a forecast yields nothing rather than throwing.
  assert.deepEqual(buildSnowReport(null, two, '2026-11-12'), []);
  assert.deepEqual(buildSnowReport({}, two, '2026-11-12'), []);
});

test('the headline names the deepest last day and never claims a resort is open', () => {
  const rows = buildSnowReport([point(WEEK), point({ ...WEEK, '2026-11-11': 30.48 })], [UTAH_RESORTS[0]!, UTAH_RESORTS[1]!], '2026-11-12');
  const line = snowHeadline(rows, '8:05 AM MT');
  assert.match(line, /Alta led the last day with 12 inches/);
  assert.match(line, /Modelled at upper mountain/);
  assert.equal(/\bopen\b|\bclosed\b|lift/i.test(line), false, 'the headline must not promise an open resort');
  assert.equal(inchesText(0), '0');
  assert.equal(inchesText(1), '1');
  assert.equal(inchesText(3.5), '3.5');
  const dry = buildSnowReport([point({ '2026-11-11': 0, '2026-11-12': 0 })], [UTAH_RESORTS[0]!], '2026-11-12');
  assert.equal(deepestLastDay(dry), null);
  assert.match(snowHeadline(dry, '8:05 AM MT'), /No resort reported new snow/);
  assert.match(snowHeadline([], '8:05 AM MT'), /could not be read/);
});

test('the table groups by region in the order a River House guest would read it', () => {
  const rows = buildSnowReport(
    [point(WEEK), point(WEEK), point(WEEK), point(WEEK), point(WEEK), point(WEEK)],
    UTAH_RESORTS.slice(0, 6),
    '2026-11-12',
  );
  const groups = snowByRegion(rows);
  assert.deepEqual(
    groups.map((group) => group.region),
    ['Provo Canyon', 'Wasatch Front', 'Park City & Deer Valley'],
  );
  assert.equal(groups[0]!.rows[0]!.key, 'sundance');
  // A region with no rows of its own is not drawn at all.
  assert.equal(groups.some((group) => group.region === 'Southern Utah'), false);
  assert.match(snowDateLabel('2026-11-14'), /^Sat, Nov 14$/);
});

test('a failed read is unread, not an empty table, and the client caches a good one', async () => {
  resetPublicSnowClientCache();
  let calls = 0;
  const failing = (async () => {
    calls += 1;
    return new Response('nope', { status: 500 });
  }) as unknown as typeof fetch;
  assert.equal(await loadPublicSnow(failing), null);
  const empty = (async () =>
    new Response(JSON.stringify({ ok: false, fetchedAt: '2026-11-12T15:00:00Z', expected: 16, rows: [], source: 'x' }), {
      status: 200,
    })) as unknown as typeof fetch;
  assert.equal(await loadPublicSnow(empty), null, 'an empty table must not read as a good answer');

  let goodCalls = 0;
  const good = (async () => {
    goodCalls += 1;
    const rows = buildSnowReport([point(WEEK)], [UTAH_RESORTS[0]!], '2026-11-12');
    return new Response(JSON.stringify({ ok: true, fetchedAt: '2026-11-12T15:00:00Z', expected: 16, rows, source: 'Open-Meteo' }), {
      status: 200,
    });
  }) as unknown as typeof fetch;
  const first = await loadPublicSnow(good);
  const second = await loadPublicSnow(good);
  assert.ok(first);
  assert.equal(goodCalls, 1, 'a second read inside the window must come from the client cache');
  assert.equal(second?.rows.length, 1);
  assert.match(snowUpdatedLabel('2026-11-12T15:00:00Z'), /8:00 AM/);
  resetPublicSnowClientCache();
});

test('the route caches, keeps the source line honest, and the UI states the number is modelled', () => {
  const route = read('functions', 'api', 'public', 'snow.ts');
  assert.match(route, /max-age=\$\{CACHE_SECONDS\}/);
  assert.match(route, /CACHE_SECONDS = 1800/);
  assert.match(route, /rows\.length > 0/);
  assert.match(route, /Not a resort snow-stake measurement/);
  const component = read('src', 'components', 'SnowReport.tsx');
  assert.match(component, /Modelled snowfall at upper mountain, not a resort snow stake/);
  assert.match(component, /could not be read just now/);
  assert.match(component, /does not mean it did not snow/);
  assert.match(component, /left out rather than shown as zero/);
  assert.equal(/\$\d/.test(component), false, 'a snow panel must not carry a price');
  // The one-click entry point sits in the conditions bar and repeats in the cams tab.
  const bar = read('src', 'components', 'CanyonConditionsBar.tsx');
  assert.match(bar, /data-bot="snow-report-open"/);
  assert.match(bar, /All Utah resort snow/);
  const map = read('src', 'components', 'CanyonPocketMap.tsx');
  assert.match(map, /<SnowReport \/>/);
});
