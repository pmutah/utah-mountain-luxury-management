import { corsJson } from '../../_lib/data';
import { PROPERTIES } from '../../_lib/data';
import {
  findSurveyByToken,
  saveSurveyAnswers,
  type GuestPreferenceAnswers,
} from '../../_lib/survey-store';
import { updateReservation } from '../../_lib/reservations-store';
import { buildStayCard, formatStayCardText } from '../../_lib/survey-stay-card';
import { staffNotifyRecipients, staffSurveyNotifyBody, staffSurveyNotifySubject } from '../../_lib/survey-copy';
import { surveyVariantForProperty } from '../../_lib/survey-fields';
import { gmailSend } from '../../_lib/gmail-store';
import { readOrRefuse } from '../../_lib/read-guard';
import type { AgentEnv } from '../../_lib/agent/types';

export const onRequestGet: PagesFunction<AgentEnv> = async ({ request, env, params }) => {
  const token = String(params.token ?? '');
  const read = await readOrRefuse(request, () => findSurveyByToken(env, token), 'This preference form');
  if (!read.ok) return read.response;
  const survey = read.value;
  if (!survey) return corsJson(request, { error: 'This link is not valid.' }, 404);
  const property = PROPERTIES[survey.propertyId];
  const variant = survey.variant ?? surveyVariantForProperty(survey.propertyId);
  return corsJson(request, {
    guestName: survey.guestName,
    propertyId: survey.propertyId,
    propertyName: property?.name ?? survey.propertyId,
    checkIn: survey.checkIn,
    checkOut: survey.checkOut,
    confirmationCode: survey.confirmationCode ?? null,
    variant,
    completed: Boolean(survey.completedAt),
    answers: survey.answers ?? null,
  });
};

export const onRequestPost: PagesFunction<AgentEnv> = async ({ request, env, params }) => {
  const token = String(params.token ?? '');
  const found = await readOrRefuse(request, () => findSurveyByToken(env, token), 'This preference form');
  if (!found.ok) return found.response;
  const survey = found.value;
  if (!survey) return corsJson(request, { error: 'This link is not valid.' }, 404);

  let answers: GuestPreferenceAnswers;
  try {
    answers = (await request.json()) as GuestPreferenceAnswers;
  } catch {
    return corsJson(request, { error: 'Invalid form data.' }, 400);
  }

  const variant = answers.surveyVariant ?? survey.variant ?? surveyVariantForProperty(survey.propertyId);
  const saved = await saveSurveyAnswers(env, token, { ...answers, surveyVariant: variant });
  if (saved?.completedAt) {
    await updateReservation(env, survey.reservationId, { surveyCompletedAt: saved.completedAt });
  }

  const propertyName = PROPERTIES[survey.propertyId]?.name ?? survey.propertyId;
  const card = buildStayCard({
    guestName: survey.guestName,
    propertyName,
    checkIn: survey.checkIn,
    checkOut: survey.checkOut,
    confirmationCode: survey.confirmationCode,
    propertyId: survey.propertyId,
    variant,
    answers: { ...answers, surveyVariant: variant },
  });
  const cardText = formatStayCardText(card);
  const subject = staffSurveyNotifySubject(survey.guestName, propertyName);
  const body = staffSurveyNotifyBody({
    guestName: survey.guestName,
    propertyName,
    checkIn: survey.checkIn,
    checkOut: survey.checkOut,
    cardText,
  });
  await Promise.all(
    staffNotifyRecipients(env).map((to) => gmailSend(env, to, subject, body).catch(() => ({ error: 'notify failed' }))),
  );

  return corsJson(request, { ok: true, completedAt: saved?.completedAt });
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
