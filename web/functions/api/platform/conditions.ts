import { hostDenied, hostOnly } from '../../_lib/auth';
import { failSoft, jsonResponse } from '../../_lib/platform/http';
import { conditionsLine, readConditions } from '../../_lib/platform/weather';
import { roadStatus } from '../../_lib/platform/roads';

/**
 * Live conditions at the three houses and at Sundance.
 *
 * Host only, and it writes nothing. The forecast comes from the National Weather Service, which needs no key. The canyon road
 * comes from UDOT, which does need one, and the response says `key set` or `key not set` rather than implying a road is open.
 *
 * Cached for fifteen minutes at the edge and no-store to the browser, so a desk that is left open does not call the NWS on every
 * render but a host waiting on a storm still sees a fresh number.
 */
export const onRequestGet: PagesFunction<{ DASHBOARD_PASSWORD?: string; UDOT_API_KEY?: string; UDOT_ROAD_ENDPOINT?: string }> = async ({
  request,
  env,
}) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  try {
    const conditions = await readConditions(fetch);
    const road = await roadStatus(fetch, env.UDOT_API_KEY, env.UDOT_ROAD_ENDPOINT);
    return jsonResponse(
      request,
      {
        ...conditions,
        line: conditionsLine(conditions),
        road,
        sends: false,
        note: 'This decides whether to suggest sending the plow. It sends no text and changes no booking.',
      },
      200,
    );
  } catch (err) {
    return failSoft(request, err, 'The weather read');
  }
};

export const onRequestOptions: PagesFunction = async ({ request }) => jsonResponse(request, null, 204);
