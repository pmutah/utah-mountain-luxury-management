import { hostDenied, hostOnly } from '../../_lib/auth';
import { corsJson } from '../../_lib/data';
import { changeLine, readChanges } from '../../_lib/platform/change-log';
import { failSoft } from '../../_lib/platform/http';

type Env = { DASHBOARD_PASSWORD?: string; MARKET_DB?: unknown };

/**
 * The rate change log.
 *
 * Host only. Newest first, with the reason each night moved. `stored: false` says the log could not be read and is **not**
 * the same as an empty log — a host who reads "no changes" when the read failed would believe nothing had moved.
 *
 * Every row in this table is a shadow row: no sender exists, so no rate was sent anywhere.
 */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  try {
    const limit = Number(new URL(request.url).searchParams.get('limit')) || 50;
    const read = await readChanges(env, limit);
    if (!read.ok) {
      return corsJson(
        request,
        {
          changes: [],
          lines: [],
          stored: false,
          reason: read.reason,
          note: 'The log could not be read. This does not mean no rate moved.',
        },
        200,
        { 'Cache-Control': 'no-store' },
      );
    }
    return corsJson(
      request,
      {
        changes: read.rows,
        lines: read.rows.map(changeLine),
        stored: true,
        sends: false,
        note: 'Shadow rows only. Every one says nothing was sent, because there is no sender.',
      },
      200,
      { 'Cache-Control': 'no-store' },
    );
  } catch (err) {
    return failSoft(request, err, 'The rate change log');
  }
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
