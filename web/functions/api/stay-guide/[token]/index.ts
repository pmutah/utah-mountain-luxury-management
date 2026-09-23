import { corsJson, PROPERTIES } from '../../../_lib/data';
import { findSurveyByToken } from '../../../_lib/survey-store';
import { getAllReservations } from '../../../_lib/reservations-store';
import { accessWindow, GUIDE_HOUSE_IDS, loadGuides, type GuideHouseId } from '../../../_lib/guest-guide';
import { isAuthenticated } from '../../../_lib/auth';
import { isMuseAuthorized } from '../../../_lib/muse/auth';
import type { AgentEnv } from '../../../_lib/agent/types';

export const onRequestGet: PagesFunction<AgentEnv & { DASHBOARD_PASSWORD?: string }> = async ({
  request,
  env,
  params,
}) => {
  const token = String(params.token ?? '');
  const survey = await findSurveyByToken(env, token);
  if (!survey || !GUIDE_HOUSE_IDS.includes(survey.propertyId as GuideHouseId)) {
    return corsJson(request, { error: 'This link is not valid.' }, 404);
  }
  const houseId = survey.propertyId as GuideHouseId;
  const guide = (await loadGuides(env))[houseId];
  const wantsPreview = new URL(request.url).searchParams.get('preview') === '1';
  const preview = wantsPreview && (isMuseAuthorized(request, env) || isAuthenticated(request, env));
  if (!guide.enabled && !preview) {
    return corsJson(request, { enabled: false }, 200, { 'Cache-Control': 'no-store' });
  }

  const stay = (await getAllReservations(env)).find((item) => item.id === survey.reservationId);
  if (stay?.status === 'cancelled') {
    return corsJson(request, { error: 'This stay was cancelled.' }, 410);
  }

  const checkIn = stay?.checkIn ?? survey.checkIn;
  const checkOut = stay?.checkOut ?? survey.checkOut;
  const window = accessWindow(checkIn, checkOut);
  const unlocked = window.open || preview;

  return corsJson(request, {
    enabled: guide.enabled,
    guestName: survey.guestName,
    propertyId: houseId,
    propertyName: PROPERTIES[houseId].name,
    checkIn,
    checkOut,
    preferencesDone: Boolean(survey.completedAt),
    access: {
      phase: window.phase,
      opensOn: window.opensOn,
      preview,
      unlocked,
      wifiName: unlocked ? guide.wifiName : null,
      wifiPassword: unlocked ? guide.wifiPassword : null,
      doorCode: unlocked ? guide.doorCode : null,
      doorNotes: unlocked ? guide.doorNotes : null,
    },
    guide: {
      headline: guide.headline,
      address: guide.address,
      checkInTime: guide.checkInTime,
      checkOutTime: guide.checkOutTime,
      parking: guide.parking,
      arrival: guide.arrival,
      checkout: guide.checkout,
      houseRules: guide.houseRules,
      contactPhone: guide.contactPhone,
      contactEmail: guide.contactEmail,
      emergency: guide.emergency,
      sections: guide.sections,
      videos: guide.videos,
      places: guide.places,
    },
  }, 200, { 'Cache-Control': 'no-store' });
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
