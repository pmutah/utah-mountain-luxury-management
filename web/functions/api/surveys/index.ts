import { hostDenied, hostOnly } from '../../_lib/auth';
import { corsJson } from '../../_lib/data';
import { loadSurveys } from '../../_lib/survey-store';
import { getAllReservations } from '../../_lib/reservations-store';
import { loadGmailTokens } from '../../_lib/gmail-store';
import { isTwilioConfigured, twilioFromNumber } from '../../_lib/twilio-sms';
import { storageReadPaused } from '../../_lib/kv-json';
import type { AgentEnv } from '../../_lib/agent/types';

export const onRequestGet: PagesFunction<AgentEnv> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  let surveys;
  let reservations;
  let gmail;
  try {
    [surveys, reservations, gmail] = await Promise.all([
      loadSurveys(env),
      getAllReservations(env),
      loadGmailTokens(env),
    ]);
  } catch (err) {
    if (storageReadPaused(err)) {
      return corsJson(request, {
        surveys: [],
        reservations: [],
        storageReads: 'paused',
        error: 'Saved bookings could not be read. Nothing was written over them.',
        gmail: null,
        sms: null,
      });
    }
    const message = err instanceof Error ? err.message : 'Guest list failed';
    return corsJson(request, { error: message }, 500);
  }
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = reservations.filter(
    (r) => r.status !== 'cancelled' && r.status !== 'blocked' && r.checkOut >= today,
  );
  return corsJson(request, {
    surveys,
    reservations: upcoming,
    storageReads: 'ok',
    gmail: {
      connected: Boolean(gmail),
      email: gmail?.email ?? null,
      oauthConfigured: Boolean(env.GOOGLE_OAUTH_CLIENT_ID?.trim() && env.GOOGLE_OAUTH_CLIENT_SECRET?.trim()),
    },
    sms: { configured: isTwilioConfigured(env), from: twilioFromNumber(env) },
  });
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
