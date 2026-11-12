import { corsJson } from '../../../_lib/data';
import { hostOnly } from '../../../_lib/auth';
import { GUIDE_HOUSE_IDS, loadGuides, type GuideHouseId } from '../../../_lib/guest-guide';
import { findReservationAnyStatus } from '../../../_lib/reservations-store';
import { findSurveyByToken } from '../../../_lib/survey-store';
import { withPausedGuard } from '../../../_lib/read-guard';
import { audit } from '../../../_lib/platform/audit-store';
import {
  cleanStayNote,
  listStayRequests,
  setStayRequest,
  stayRequestKind,
  stayRequestLine,
  type StayRequestHouse,
} from '../../../_lib/platform/stay-request-store';
import type { SettingsEnv } from '../../../_lib/kv';

type Env = SettingsEnv & { DASHBOARD_PASSWORD?: string; MARKET_DB?: unknown };

const CLOSED = new Set(['cancelled', 'declined', 'blocked']);

type StayContext = {
  reservationId: string;
  house: StayRequestHouse;
  checkIn: string;
  checkOut: string;
};

/**
 * A guest files an add-on from the stay link.
 *
 * The token is the credential. The answer is the request for this stay only. It does not text anyone, and it does not
 * move the booking. A bad token is refused.
 */
async function stayForToken(
  request: Request,
  env: Env,
  token: string,
): Promise<{ stay: StayContext } | { response: Response }> {
  const survey = await findSurveyByToken(env, token);
  if (!survey || !GUIDE_HOUSE_IDS.includes(survey.propertyId as GuideHouseId)) {
    return { response: corsJson(request, { error: 'This link is not valid.' }, 404) };
  }
  const house = survey.propertyId as StayRequestHouse;
  const guide = (await loadGuides(env))[house];
  if (!guide?.enabled && !hostOnly(request, env)) {
    return { response: corsJson(request, { error: 'The guest app is off for this house.' }, 403) };
  }
  const reservation = await findReservationAnyStatus(env, survey.reservationId);
  if (reservation?.status && CLOSED.has(reservation.status)) {
    return { response: corsJson(request, { error: 'This stay is not open for a request.' }, 410) };
  }
  const checkIn = reservation?.checkIn ?? survey.checkIn;
  const checkOut = reservation?.checkOut ?? survey.checkOut;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut)) {
    return { response: corsJson(request, { error: 'This stay has no dates to attach a request to.' }, 409) };
  }
  return {
    stay: {
      reservationId: survey.reservationId,
      house,
      checkIn,
      checkOut,
    },
  };
}

function guestItem(item: { kind: string; status: string; note: string | null; line: string }) {
  return { kind: item.kind, status: item.status, note: item.note, line: item.line };
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) =>
  withPausedGuard(
    request,
    async () => {
      const resolved = await stayForToken(request, env, String(params.token ?? ''));
      if ('response' in resolved) return resolved.response;
      const read = await listStayRequests(env, resolved.stay.reservationId);
      if (!read.ok) {
        return corsJson(request, { stored: false, items: [], reason: read.reason, sends: false, changesBooking: false }, 200);
      }
      return corsJson(request, {
        stored: true,
        items: read.items.map((item) => guestItem({ ...item, line: stayRequestLine(item) })),
        sends: false,
        changesBooking: false,
      });
    },
    'This stay',
  );

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) =>
  withPausedGuard(
    request,
    async () => {
      const resolved = await stayForToken(request, env, String(params.token ?? ''));
      if ('response' in resolved) return resolved.response;
      let body: { kind?: unknown; on?: unknown; note?: unknown };
      try {
        body = (await request.json()) as { kind?: unknown; on?: unknown; note?: unknown };
      } catch {
        return corsJson(request, { error: 'That request could not be read. Send it again.' }, 400);
      }
      const kind = stayRequestKind(body.kind);
      if (!kind) return corsJson(request, { error: 'Choose an early arrival, a later checkout, the hot tub, or a grocery drop.' }, 400);
      if (typeof body.on !== 'boolean') return corsJson(request, { error: 'Say whether the request is on or off.' }, 400);
      const note = cleanStayNote(body.note);
      if (!note.ok) return corsJson(request, { error: note.error, sends: false, changesBooking: false }, 400);
      const filed = await setStayRequest(env, crypto.randomUUID(), resolved.stay, kind, body.on, note.note);
      if (!filed.ok) return corsJson(request, { error: filed.reason, sends: false, changesBooking: false }, 503);
      if (filed.item && body.on) {
        const logged = await audit(env, {
          actor: { role: 'guest' },
          action: 'stay-request.file',
          target: filed.item.id,
          note: `Filed a ${kind} wait for ${filed.item.house}.`,
        });
        return corsJson(request, {
          item: guestItem({ ...filed.item, line: stayRequestLine(filed.item) }),
          sends: false,
          changesBooking: false,
          ...(logged.ok ? {} : { auditFailed: logged.reason }),
        });
      }
      return corsJson(request, {
        item: filed.item ? guestItem({ ...filed.item, line: stayRequestLine(filed.item) }) : null,
        sends: false,
        changesBooking: false,
      });
    },
    'This stay',
  );

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
