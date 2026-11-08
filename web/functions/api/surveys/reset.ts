import { corsJson } from '../../_lib/data';
import { hostDenied, hostOnly } from '../../_lib/auth';
import { clearSurveyAnswers } from '../../_lib/survey-store';
import { updateReservation } from '../../_lib/reservations-store';
import { readOrRefuse } from '../../_lib/read-guard';
import type { AgentEnv } from '../../_lib/agent/types';

/**
 * Clear one guest's preference card so it can be filled again.
 *
 * `saveSurveyAnswers` stamps `completedAt` unconditionally and `preferencesDone` keys off exactly that, so a submitted
 * card was **final** — there was no way back for a guest who submitted by mistake, or for a card entered in error.
 *
 * I needed it while verifying this write path: a probe card landed on a **real** guest's stay, and the only way to
 * undo it would otherwise have been to delete her survey, which would also have destroyed her token and her link. That
 * is the wrong kind of fix for a data mistake.
 *
 * Scoped to one token. The token, the stay, and the sent history stay, so the guest's link still opens the form. The
 * reservation's own `surveyCompletedAt` is cleared with it, because a stamped stay is what the guest portal reads.
 */
export const onRequestPost: PagesFunction<AgentEnv> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);

  let body: { token?: unknown };
  try {
    body = (await request.json()) as { token?: unknown };
  } catch {
    return corsJson(request, { error: 'Invalid JSON' }, 400);
  }
  const token = typeof body.token === 'string' ? body.token.trim() : '';
  if (!token) return corsJson(request, { error: 'A survey token is required.' }, 400);

  const read = await readOrRefuse(request, () => clearSurveyAnswers(env, token), 'The preference card');
  if (!read.ok) return read.response;
  if (!read.value) return corsJson(request, { error: 'That card does not exist.' }, 404);

  // The stay is only cleared once the card is, so a failure here cannot leave the two disagreeing.
  const reservation = await updateReservation(env, read.value.reservationId, { surveyCompletedAt: null }).catch(
    () => null,
  );

  return corsJson(
    request,
    {
      ok: true,
      token,
      reservationId: read.value.reservationId,
      /** False when the stay row could not be updated; the card is still cleared. */
      reservationCleared: Boolean(reservation),
      line: 'That card is empty again. The guest can fill it, and the stay no longer counts it as done.',
    },
    200,
    { 'Cache-Control': 'no-store' },
  );
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
