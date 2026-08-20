import { corsJson, PROPERTIES } from '../../_lib/data';
import { getAllReservations, updateReservation } from '../../_lib/reservations-store';
import { upsertSurveyForStay, markSurveySent } from '../../_lib/survey-store';
import { gmailSend } from '../../_lib/gmail-store';
import { sendTwilioSms } from '../../_lib/twilio-sms';
import {
  surveyEmailBody,
  surveyEmailSubject,
  surveyPublicUrl,
  surveySmsBody,
} from '../../_lib/survey-copy';
import type { AgentEnv, PropertyId } from '../../_lib/agent/types';

export const onRequestPost: PagesFunction<AgentEnv> = async ({ request, env }) => {
  const body = (await request.json()) as {
    reservationId?: string;
    channel?: 'email' | 'sms';
    guestEmail?: string;
    guestPhone?: string;
  };

  if (!body.reservationId || (body.channel !== 'email' && body.channel !== 'sms')) {
    return corsJson(request, { error: 'reservationId and channel (email|sms) required' }, 400);
  }

  const all = await getAllReservations(env);
  const stay = all.find((r) => r.id === body.reservationId);
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
  });

  const origin = new URL(request.url).origin;
  const link = surveyPublicUrl(origin, survey.token);
  const propertyName = PROPERTIES[stay.propertyId]?.name ?? stay.propertyId;

  if (body.channel === 'email') {
    if (!email) return corsJson(request, { error: 'Add an email first.' }, 400);
    const sent = await gmailSend(
      env,
      email,
      surveyEmailSubject(stay.guestName, propertyName),
      surveyEmailBody({
        guestName: stay.guestName,
        propertyName,
        checkIn: stay.checkIn,
        checkOut: stay.checkOut,
        link,
      }),
    );
    if (sent.error) return corsJson(request, { error: sent.error }, 502);
  } else {
    if (!phone) return corsJson(request, { error: 'Add a phone number first.' }, 400);
    const sent = await sendTwilioSms(
      env,
      phone,
      surveySmsBody({ guestName: stay.guestName, propertyName, link }),
    );
    if (sent.error) return corsJson(request, { error: sent.error }, 502);
  }

  await markSurveySent(env, survey.token, body.channel);
  await updateReservation(env, stay.id, {
    surveyToken: survey.token,
    surveySentAt: new Date().toISOString(),
    surveyChannel: body.channel,
    guestEmail: email || stay.guestEmail,
    guestPhone: phone || stay.guestPhone,
  });

  return corsJson(request, { ok: true, token: survey.token, link, channel: body.channel });
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
