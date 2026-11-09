import { hostDenied, hostOnly } from '../../_lib/auth';
import { corsJson, PROPERTIES } from '../../_lib/data';
import { readJsonBody } from '../../_lib/json-body';
import { updateReservation } from '../../_lib/reservations-store';
import { upsertSurveyForStay, markSurveySent } from '../../_lib/survey-store';
import { resolveStayForSurvey } from '../../_lib/survey-bind';
import { gmailSend } from '../../_lib/gmail-store';
import { sendTwilioSms } from '../../_lib/twilio-sms';
import { guideEnabled } from '../../_lib/guest-guide';
import {
  surveyEmailBody,
  surveyEmailSubject,
  surveyPublicUrl,
  surveySmsBody,
} from '../../_lib/survey-copy';
import { surveyVariantForProperty, type SurveyChannel } from '../../_lib/survey-fields';
import type { AgentEnv, PropertyId } from '../../_lib/agent/types';

function isSurveyChannel(value: unknown): value is SurveyChannel {
  return value === 'email' || value === 'sms' || value === 'none';
}

export const onRequestPost: PagesFunction<AgentEnv> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  const parsed = await readJsonBody<{
    reservationId?: string;
    confirmationCode?: string;
    channel?: SurveyChannel;
    guestEmail?: string;
    guestPhone?: string;
  }>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  if (!isSurveyChannel(body.channel)) {
    return corsJson(request, { error: 'channel (email|sms|none) required' }, 400);
  }
  if (!body.reservationId && !body.confirmationCode) {
    return corsJson(request, { error: 'reservationId or confirmationCode required' }, 400);
  }

  const stay = await resolveStayForSurvey(env, {
    reservationId: body.reservationId,
    confirmationCode: body.confirmationCode,
  });
  if (!stay) return corsJson(request, { error: 'Reservation not found' }, 404);

  const email = (body.guestEmail ?? stay.guestEmail)?.trim();
  const phone = (body.guestPhone ?? stay.guestPhone)?.trim();

  if (body.guestEmail !== undefined || body.guestPhone !== undefined) {
    await updateReservation(env, stay.id, {
      guestEmail: email || stay.guestEmail,
      guestPhone: phone || stay.guestPhone,
    });
  }

  const survey = await upsertSurveyForStay(env, {
    id: stay.id,
    propertyId: stay.propertyId as PropertyId,
    guestName: stay.guestName,
    checkIn: stay.checkIn,
    checkOut: stay.checkOut,
    confirmationCode: stay.confirmationCode || body.confirmationCode,
  });

  const origin = new URL(request.url).origin;
  const link = surveyPublicUrl(origin, survey.token);
  const propertyName = PROPERTIES[stay.propertyId]?.name ?? stay.propertyId;
  const variant = survey.variant ?? surveyVariantForProperty(stay.propertyId);
  const guideOn = await guideEnabled(env, stay.propertyId);

  if (body.channel === 'email') {
    if (!email) return corsJson(request, { error: 'Add an email first.' }, 400);
    const sent = await gmailSend(
      env,
      email,
      surveyEmailSubject(propertyName, guideOn),
      surveyEmailBody({
        guestName: stay.guestName,
        propertyName,
        checkIn: stay.checkIn,
        checkOut: stay.checkOut,
        link,
        variant,
        guideOn,
      }),
    );
    if (sent.error) {
      /*
       * A failed send must not be a dead end.
       *
       * The link is already built at this point, and the host can copy it or text it. When email is broken on this
       * deployment the raw provider error ("invalid_client") gives a host nothing to do — so the response carries the
       * link and the alternatives, and the desk can act without knowing what OAuth is.
       */
      return corsJson(
        request,
        {
          error: sent.error,
          link,
          canCopy: true,
          alternatives:
            'The link above works. Copy it and send it to the guest yourself, or try the text channel, which uses a different provider.',
        },
        502,
      );
    }
  } else if (body.channel === 'sms') {
    if (!phone) return corsJson(request, { error: 'Add a phone number first.' }, 400);
    const sent = await sendTwilioSms(
      env,
      phone,
      surveySmsBody({ guestName: stay.guestName, propertyName, link, guideOn }),
    );
    if (sent.error) {
      // Same rule for the text channel: the link is the useful part, so it goes back with the failure.
      return corsJson(
        request,
        {
          error: sent.error,
          link,
          canCopy: true,
          alternatives:
            'The link above works. Copy it and send it to the guest yourself, or try email, which uses a different provider.',
        },
        502,
      );
    }
  }

  await markSurveySent(env, survey.token, body.channel);
  await updateReservation(env, stay.id, {
    surveyToken: survey.token,
    surveySentAt: new Date().toISOString(),
    surveyChannel: body.channel,
    guestEmail: email || stay.guestEmail,
    guestPhone: phone || stay.guestPhone,
    confirmationCode: stay.confirmationCode || body.confirmationCode,
  });

  return corsJson(request, {
    ok: true,
    token: survey.token,
    link,
    channel: body.channel,
    reservationId: stay.id,
    confirmationCode: stay.confirmationCode || body.confirmationCode || null,
  });
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
