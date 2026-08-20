import { corsJson } from '../../_lib/data';
import { loadSurveys } from '../../_lib/survey-store';
import { getAllReservations } from '../../_lib/reservations-store';
import { loadGmailTokens } from '../../_lib/gmail-store';
import { isTwilioConfigured, twilioFromNumber } from '../../_lib/twilio-sms';
import type { AgentEnv } from '../../_lib/agent/types';

export const onRequestGet: PagesFunction<AgentEnv> = async ({ request, env }) => {
  const [surveys, reservations, gmail] = await Promise.all([
    loadSurveys(env),
    getAllReservations(env),
    loadGmailTokens(env),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = reservations.filter(
    (r) => r.status !== 'cancelled' && r.status !== 'blocked' && r.checkOut >= today,
  );
  return corsJson(request, {
    surveys,
    reservations: upcoming,
    gmail: { connected: Boolean(gmail), email: gmail?.email ?? null },
    sms: { configured: isTwilioConfigured(env), from: twilioFromNumber(env) },
  });
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
