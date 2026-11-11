import { hostDenied, hostOnly } from '../../_lib/auth';
import { corsJson } from '../../_lib/data';
import { readJsonBody } from '../../_lib/json-body';
import { pauseLine, readPause, writePause, HOUSES, type HouseId } from '../../_lib/platform/pause-store';
import { failSoft } from '../../_lib/platform/http';

type Env = { DASHBOARD_PASSWORD?: string; MARKET_DB?: unknown };

function houseFrom(value: unknown): HouseId | null {
  return value === 'ranch' || value === 'lindon' || value === 'river' ? value : null;
}

/**
 * The per-house pricing kill switch.
 *
 * Host only. `GET` reports what every house currently says. `POST { house, paused, reason? }` sets one house.
 *
 * The read is honest about failure: if the switch cannot be read, every house reports **paused** and the response says so,
 * because a switch that cannot be read must never behave as if it were off. This route writes a pause row and nothing else;
 * it does not change a rate, a booking, or an expense.
 */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  try {
    const read = await readPause(env);
    return corsJson(
      request,
      {
        paused: read.paused,
        readable: read.ok,
        reasons: read.ok ? read.reasons : {},
        why: read.ok ? undefined : read.why,
        lines: Object.fromEntries(HOUSES.map((house) => [house, pauseLine(house, read.paused[house])])),
        sends: false,
        note: 'A paused house is not raised or promoted. This does not change a published rate.',
      },
      200,
      { 'Cache-Control': 'no-store' },
    );
  } catch (err) {
    return failSoft(request, err, 'The pricing pause switch');
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  try {
    const parsed = await readJsonBody<{ house?: unknown; paused?: unknown; reason?: unknown }>(request);
    if (!parsed.ok) return parsed.response;
    const house = houseFrom(parsed.body.house);
    if (!house) return corsJson(request, { error: 'Choose a house: ranch, lindon, or river.' }, 400);
    if (typeof parsed.body.paused !== 'boolean') {
      return corsJson(request, { error: 'Send paused as true or false.' }, 400);
    }
    const reason = typeof parsed.body.reason === 'string' ? parsed.body.reason : null;
    const written = await writePause(env, house, parsed.body.paused, reason);
    if (!written.ok) return corsJson(request, { error: written.reason, paused: null }, 503);
    const read = await readPause(env);
    return corsJson(request, {
      house,
      paused: written.paused,
      state: read.paused,
      readable: read.ok,
      line: pauseLine(house, written.paused, reason ?? undefined),
      sends: false,
      note: 'This does not change a published rate. Nothing is sent to Airbnb, VRBO, or Hospitable.',
    });
  } catch (err) {
    return failSoft(request, err, 'The pricing pause switch');
  }
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
