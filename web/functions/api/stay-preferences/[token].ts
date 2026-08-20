import { corsJson } from '../../_lib/data';
import { PROPERTIES } from '../../_lib/data';
import {
  findSurveyByToken,
  saveSurveyAnswers,
  type GuestPreferenceAnswers,
} from '../../_lib/survey-store';
import type { SettingsEnv } from '../../_lib/kv';

export const onRequestGet: PagesFunction<SettingsEnv> = async ({ request, env, params }) => {
  const token = String(params.token ?? '');
  const survey = await findSurveyByToken(env, token);
  if (!survey) return corsJson(request, { error: 'This link is not valid.' }, 404);
  const property = PROPERTIES[survey.propertyId];
  return corsJson(request, {
    guestName: survey.guestName,
    propertyName: property?.name ?? survey.propertyId,
    checkIn: survey.checkIn,
    checkOut: survey.checkOut,
    completed: Boolean(survey.completedAt),
    answers: survey.answers ?? null,
  });
};

export const onRequestPost: PagesFunction<SettingsEnv> = async ({ request, env, params }) => {
  const token = String(params.token ?? '');
  const survey = await findSurveyByToken(env, token);
  if (!survey) return corsJson(request, { error: 'This link is not valid.' }, 404);

  let answers: GuestPreferenceAnswers;
  try {
    answers = (await request.json()) as GuestPreferenceAnswers;
  } catch {
    return corsJson(request, { error: 'Invalid form data.' }, 400);
  }

  const saved = await saveSurveyAnswers(env, token, answers);
  return corsJson(request, { ok: true, completedAt: saved?.completedAt });
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
