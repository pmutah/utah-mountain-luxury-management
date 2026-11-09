import { corsJson } from '../../_lib/data';
import { hostDenied, hostOnly } from '../../_lib/auth';
import { storageReadPaused } from '../../_lib/kv-json';
import { loadRiverUnitRates } from '../../_lib/pricing-store';
import { getAllReservations } from '../../_lib/reservations-store';
import { loadCalendarBlocks } from '../../_lib/calendar-store';
import { nightAsk } from '../../../src/lib/market/rates';
import { denverToday, addDays } from '../../../src/lib/market/dates';
import { RIVER_UNITS, riverAvailability, type UnitSpan } from '../../../src/lib/river-units';
import { unitRateState } from '../../../src/lib/river-unit-rates';
import { decideSplit, DEFAULT_SPLIT, type SplitMode } from '../../../src/lib/river-split';
import type { SettingsEnv } from '../../_lib/kv';

type Env = SettingsEnv & { DASHBOARD_PASSWORD?: string };

const MODES: SplitMode[] = ['auto', 'suggest-only', 'off'];

/**
 * Whether to sell the Riverhouse whole or in parts, for one range, from real data.
 *
 * The decision engine was written and tested and then had no caller, so a host could not see it. This serves it: real
 * unit prices, real free nights, real whole-house rate. Nothing here is a default standing in for a measurement — a
 * unit with no price is left out, and a range with no priced unit says so rather than inventing a split.
 *
 * It only answers. It does not block a night, publish a rate, or change a booking.
 */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);

  const url = new URL(request.url);
  const from = url.searchParams.get('from') ?? denverToday();
  const untilParam = url.searchParams.get('until');
  const until = untilParam ?? addDays(from, 14);
  const modeParam = url.searchParams.get('mode');
  const mode: SplitMode = MODES.includes(modeParam as SplitMode) ? (modeParam as SplitMode) : 'auto';

  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(until) || until <= from) {
    return corsJson(request, { error: 'Name a real range: until has to be after from.' }, 400);
  }

  let rates;
  let stays: UnitSpan[];
  let blocks;
  try {
    rates = await loadRiverUnitRates(env);
    stays = (await getAllReservations(env)) as unknown as UnitSpan[];
    blocks = await loadCalendarBlocks(env);
  } catch (err) {
    if (storageReadPaused(err)) {
      return corsJson(request, { decision: null, storageReads: 'paused' }, 503);
    }
    const message = err instanceof Error ? err.message : 'The split decision could not be read.';
    return corsJson(request, { error: message }, 500);
  }

  /*
   * Sold and closed are different facts and both block a night. A block is a host decision, so it is passed as a
   * whole-house block: the house is not sellable whole on a closed night, and neither is a part.
   */
  const blockSpans: UnitSpan[] = blocks.map((block) => ({
    propertyId: block.propertyId,
    checkIn: block.start,
    checkOut: block.end,
    status: 'blocked',
  }));
  const availability = riverAvailability([...stays, ...blockSpans], from, until);

  const unitFreeNightly: Record<string, Set<string>> = {};
  for (const unit of RIVER_UNITS) unitFreeNightly[unit] = new Set(availability.units[unit]);

  /*
   * A unit with no price is not a unit we can offer, so its nightly is not passed. `decideSplit` sums the offered
   * units, and a zero would read as a free night rather than "not for sale".
   */
  const unitNightly = Object.fromEntries(
    RIVER_UNITS.map((unit) => [unit, unitRateState(rates[unit]) === 'ready' ? (rates[unit].nightly ?? 0) : 0]),
  ) as Record<(typeof RIVER_UNITS)[number], number>;
  const pricedUnits = RIVER_UNITS.filter((unit) => unitNightly[unit] > 0);

  if (pricedUnits.length === 0) {
    return corsJson(
      request,
      {
        decision: null,
        mode,
        publishes: false,
        reason:
          'No part of the Riverhouse has a price, so there is nothing to split. Set a nightly rate on a part first; until then the whole-house answer stands.',
        pricedUnits: [],
        storageReads: 'ok',
      },
      200,
      { 'Cache-Control': 'no-store' },
    );
  }

  /*
   * The whole-house rate. `nightAsk` is the published card, which is what a whole stay actually quotes; a night the host
   * approved separately is not the card and would misstate the comparison.
   */
  const wholeNightly = nightAsk('river', from).guest;

  /*
   * A night the house cannot sell whole: sold, closed, or held. `riverAvailability.wholeHouse` is exactly the nights
   * still free as a house, so anything in the range that is not in it is blocked.
   */
  const sellableWhole = new Set(availability.wholeHouse);
  const wholeBlocked = new Set<string>();
  const nights: string[] = [];
  for (let cursor = from; cursor < until; cursor = addDays(cursor, 1)) {
    nights.push(cursor);
    if (!sellableWhole.has(cursor)) wholeBlocked.add(cursor);
  }

  const decision = decideSplit({
    from,
    until,
    prices: { wholeNightly, unitNightly },
    freeUnitsByNight: availability.freeUnitsByNight,
    unitFreeNightly,
    wholeBlocked,
    defaults: DEFAULT_SPLIT,
  });

  return corsJson(
    request,
    {
      decision,
      mode,
      from,
      until,
      nights: nights.length,
      wholeNightly,
      pricedUnits,
      /** False on every response: this route answers a question and writes nothing anywhere. */
      publishes: false,
      writeNote:
        'This decides what to offer. It does not block a night, publish a rate, or send anything to Airbnb or Vrbo.',
      storageReads: 'ok',
    },
    200,
    { 'Cache-Control': 'no-store' },
  );
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
