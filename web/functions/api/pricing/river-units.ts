import { corsJson } from '../../_lib/data';
import { hostDenied, hostOnly } from '../../_lib/auth';
import { storageReadPaused } from '../../_lib/kv-json';
import { loadRiverUnitRates, saveRiverUnitRates } from '../../_lib/pricing-store';
import { getAllReservations } from '../../_lib/reservations-store';
import { sellableUnits, toUnitRates, unitRateLine, unitRateState } from '../../../src/lib/river-unit-rates';
import { RIVER_UNIT_DETAIL, RIVER_UNITS, riverAvailability, type UnitSpan } from '../../../src/lib/river-units';
import { denverToday } from '../../../src/lib/market/dates';
import type { SettingsEnv } from '../../_lib/kv';

type Env = SettingsEnv & { DASHBOARD_PASSWORD?: string };

/**
 * The three Riverhouse units: what they cost, and which nights each one can still be sold.
 *
 * Host only. Nothing here publishes a rate or a block to another channel — the spec's channel cascade needs a token
 * this deployment does not have, so this route is the local truth and says so.
 */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);

  let rates;
  let stays: UnitSpan[];
  try {
    rates = await loadRiverUnitRates(env);
    stays = (await getAllReservations(env)) as unknown as UnitSpan[];
  } catch (err) {
    if (storageReadPaused(err)) {
      return corsJson(request, { units: null, storageReads: 'paused' }, 503);
    }
    const message = err instanceof Error ? err.message : 'The unit rates could not be read.';
    return corsJson(request, { error: message }, 500);
  }

  const today = denverToday();
  const until = `${Number(today.slice(0, 4)) + 1}-12-31`;
  const availability = riverAvailability(stays, today, until);
  const sellable = new Set(sellableUnits(rates));

  return corsJson(
    request,
    {
      /*
       * Every unit is listed, priced or not. A unit with no rate is **not sellable**, and `rateLine` says what it is
       * missing — hiding it would leave the host wondering whether the unit exists at all.
       */
      units: RIVER_UNIT_DETAIL.map((unit) => ({
        ...unit,
        rate: rates[unit.id],
        rateState: unitRateState(rates[unit.id]),
        rateLine: unitRateLine(rates[unit.id]),
        /** Only a fully priced unit may be offered; an unpriced one can never be sold. */
        sellable: sellable.has(unit.id),
        freeNights: availability.units[unit.id].length,
      })),
      wholeHouse: { freeNights: availability.wholeHouse.length },
      storageReads: 'ok',
      /** True on every response: this route writes only the host's own prices. No block leaves this app. */
      publishes: false,
      publishNote:
        'Blocks and prices stay in this app. Nothing is sent to Hospitable, Airbnb, or Vrbo from here, so a booking taken on another channel is not reflected in these nights.',
    },
    200,
    { 'Cache-Control': 'no-store' },
  );
};

/**
 * Set one unit's price. Merges, so saving the Garage Suite leaves the other two alone.
 *
 * A rate that cannot be a real price is refused rather than stored: a nightly of 0 would let a guest book for nothing.
 */
export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);

  let body: { unit?: unknown; nightly?: unknown; cleaning?: unknown; minNights?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return corsJson(request, { error: 'Invalid JSON' }, 400);
  }
  const unit = String(body.unit ?? '');
  if (!(RIVER_UNITS as readonly string[]).includes(unit)) {
    return corsJson(request, { error: 'Name one of the three Riverhouse units.' }, 400);
  }
  const id = unit as (typeof RIVER_UNITS)[number];

  let current;
  try {
    current = await loadRiverUnitRates(env);
  } catch (err) {
    if (storageReadPaused(err)) {
      return corsJson(request, { error: 'The unit rates could not be read. Nothing was written.' }, 503);
    }
    throw err;
  }

  // Only the fields sent are changed, so a partial save is a merge rather than a reset.
  const next = toUnitRates({
    ...current,
    [id]: {
      nightly: body.nightly === undefined ? current[id].nightly : body.nightly,
      cleaning: body.cleaning === undefined ? current[id].cleaning : body.cleaning,
      minNights: body.minNights === undefined ? current[id].minNights : body.minNights,
    },
  });

  /*
   * A rate the host typed that came back null was refused, not stored. Saying so is the point: a silent null would
   * leave the unit looking priced to the host and unsellable to a guest.
   */
  if (body.nightly !== undefined && next[id].nightly === null) {
    return corsJson(
      request,
      { error: 'A nightly rate has to be a whole number of dollars above zero. Nothing was written.' },
      400,
    );
  }

  try {
    await saveRiverUnitRates(env, next);
  } catch (err) {
    if (storageReadPaused(err)) {
      return corsJson(request, { error: 'The unit rate could not be saved. Nothing was written.' }, 503);
    }
    const message = err instanceof Error ? err.message : 'The save failed';
    return corsJson(request, { error: message }, 500);
  }

  return corsJson(
    request,
    {
      ok: true,
      unit: id,
      rate: next[id],
      rateLine: unitRateLine(next[id]),
      sellable: sellableUnits(next).includes(id),
      /** Nothing is published anywhere by this route. */
      publishes: false,
    },
    200,
    { 'Cache-Control': 'no-store' },
  );
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
