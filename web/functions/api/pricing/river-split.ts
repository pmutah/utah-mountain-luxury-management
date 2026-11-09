import { corsJson } from '../../_lib/data';
import { hostDenied, hostOnly } from '../../_lib/auth';
import { storageReadPaused } from '../../_lib/kv-json';
import { loadRiverUnitRates, loadRiverSplitMode, saveRiverSplitMode } from '../../_lib/pricing-store';
import { getAllReservations } from '../../_lib/reservations-store';
import { loadCalendarBlocks } from '../../_lib/calendar-store';
import { nightAsk } from '../../../src/lib/market/rates';
import { denverToday, addDays } from '../../../src/lib/market/dates';
import { RIVER_UNITS, riverAvailability, type UnitSpan } from '../../../src/lib/river-units';
import { unitRateState } from '../../../src/lib/river-unit-rates';
import { decideSplit, DEFAULT_SPLIT } from '../../../src/lib/river-split';
import { applySplitMode, readSplitMode } from '../../../src/lib/river-split-mode';
import type { SettingsEnv } from '../../_lib/kv';

type Env = SettingsEnv & { DASHBOARD_PASSWORD?: string };

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

  /*
   * The mode comes from storage when the query does not name one, so a host who turned splitting off is not silently
   * back on `auto` after a reload. An explicit query value still wins, because that is how the card previews a mode.
   */
  let mode = readSplitMode(url.searchParams.get('mode'));
  if (!url.searchParams.has('mode')) {
    try {
      mode = await loadRiverSplitMode(env);
    } catch {
      // A stored mode that cannot be read falls back to the shipped default rather than refusing to answer.
      mode = 'auto';
    }
  }
  /** True when the answer used the saved setting rather than one named in the URL. */
  const modeFromStorage = !url.searchParams.has('mode');

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
  /*
   * The host's mode has to change the answer, or it is not a setting.
   *
   * `off` forces the house whole and strips the units; `suggest-only` keeps the answer and says nothing acts on it. The
   * engine's own choice is kept beside the applied one, so a host who turned splitting off can still see what it costs.
   */
  const applied = applySplitMode(decision, mode);

  return corsJson(
    request,
    {
      decision: { ...decision, choice: applied.choice, units: applied.units },
      mode,
      modeFromStorage,
      /** What the engine chose before the mode, so an override is visible rather than silent. */
      engineChoice: applied.engineChoice,
      overridden: applied.overridden,
      modeLine: applied.modeLine,
      from,
      until,
      nights: nights.length,
      wholeNightly,
      pricedUnits,
      /**
       * False on both methods. GET writes nothing; PUT writes one word, the host's own setting. Neither blocks a night,
       * publishes a rate, nor sends anything to another channel.
       */
      publishes: false,
      writeNote:
        'This decides what to offer. It does not block a night, publish a rate, or send anything to Airbnb or Vrbo.',
      storageReads: 'ok',
    },
    200,
    { 'Cache-Control': 'no-store' },
  );
};

/**
 * Save the host's whole-versus-split setting.
 *
 * This is the only write on the route, and it changes one word. It does not block a night, publish a rate, or alter a
 * booking — it changes what the card answers the next time it is opened.
 */
export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);

  let body: { mode?: unknown };
  try {
    body = (await request.json()) as { mode?: unknown };
  } catch {
    return corsJson(request, { error: 'Invalid JSON' }, 400);
  }
  /*
   * A mode that is not one of the three is refused rather than stored as `auto`. Silently normalising it would leave the
   * host believing they had turned splitting off when they had not.
   */
  if (body.mode !== 'auto' && body.mode !== 'suggest-only' && body.mode !== 'off') {
    return corsJson(request, { error: 'Say auto, suggest-only, or off.' }, 400);
  }
  let saved;
  try {
    saved = await saveRiverSplitMode(env, body.mode);
  } catch (err) {
    if (storageReadPaused(err)) {
      return corsJson(request, { error: 'The setting could not be saved. Nothing was written.' }, 503);
    }
    const message = err instanceof Error ? err.message : 'The setting could not be saved.';
    return corsJson(request, { error: message }, 500);
  }
  return corsJson(
    request,
    {
      ok: true,
      mode: saved,
      publishes: false,
      note:
        saved === 'off'
          ? 'Splitting is off. The parts will not be offered for any range until this changes.'
          : saved === 'suggest-only'
            ? 'Suggest only. The card will advise and nothing offers the parts on its own.'
            : 'Auto. The card acts on the decision for each range.',
    },
    200,
    { 'Cache-Control': 'no-store' },
  );
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
