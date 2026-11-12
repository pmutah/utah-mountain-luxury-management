import { corsJson } from '../../../_lib/data';
import { findSurveyByToken } from '../../../_lib/survey-store';
import { readConditions, HOUSE_POINTS } from '../../../_lib/platform/weather';
import { readRiverFlow } from '../../../_lib/platform/river-flow';

type HouseId = 'ranch' | 'lindon' | 'river';

const GUIDE_HOUSES: HouseId[] = ['ranch', 'lindon', 'river'];

/**
 * The three-day forecast and any winter alert for the house this stay is at.
 *
 * The token in the path is the whole credential, exactly as it is for the rest of the guest guide, and the response carries only
 * weather — no name, no dates, no door code. A guest planning a drive up the canyon in November is the person this is for, and
 * asking them to sign in to read a forecast would be absurd.
 *
 * It is a separate call from the guide on purpose: a slow forecast must never hold up the page the guest actually opened. The
 * guest app calls this after the guide is on screen and drops it if it fails.
 */
export const onRequestGet: PagesFunction<{ SETTINGS?: unknown }> = async ({ request, env, params }) => {
  const token = String(params.token ?? '');
  const survey = await findSurveyByToken(env as never, token).catch(() => null);
  if (!survey || !GUIDE_HOUSES.includes(survey.propertyId as HouseId)) {
    return corsJson(request, { error: 'This link is not valid.' }, 404);
  }
  const house = survey.propertyId as HouseId;
  const [conditions, river] = await Promise.all([
    readConditions(fetch),
    house === 'river' ? readRiverFlow(fetch) : Promise.resolve(null),
  ]);
  const point = HOUSE_POINTS.find((row) => row.id === house);
  const days = conditions.houses.find((row) => row.id === house)?.days ?? [];
  /*
   * An alert is reported whether or not a forecast came back, because a warning is the part that matters when driving. The line
   * never says a road is open or that travel is safe.
   */
  const winter = conditions.alerts.filter((alert) => /winter|snow|ice|storm|wind|fog/i.test(alert.event));
  return corsJson(
    request,
    {
      ok: conditions.ok,
      house,
      label: point?.label ?? 'this house',
      days,
      snow48: conditions.snow?.inches48 ?? null,
      alerts: winter.map((alert) => ({ event: alert.event, headline: alert.headline })),
      line: conditions.ok
        ? days.length > 0
          ? ''
          : 'The weather service did not return a forecast for this house.'
        : 'The forecast could not be read just now. That is not the same as clear weather.',
      advisory: winter.length > 0
        ? `${winter[0]!.event} covers this area. Carry chains or drive a capable vehicle, and check the canyon before you go.`
        : '',
      river,
      sends: false,
    },
    200,
    { 'Cache-Control': 'public, max-age=300' },
  );
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
