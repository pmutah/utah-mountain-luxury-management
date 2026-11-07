import { hostDenied, hostOnly } from '../../../_lib/auth';
import { corsJson } from '../../../_lib/data';
import { gmailSend } from '../../../_lib/gmail-store';
import type { AgentEnv } from '../../../_lib/agent/types';
import { updateReservation } from '../../../_lib/reservations-store';
import { findSurveyByToken } from '../../../_lib/survey-store';
import { guideEnabled } from '../../../_lib/guest-guide';
import { denverToday } from '../../../../src/lib/market/dates';
import { canSendMessage, sendableLine, sendableToday } from '../../../../src/lib/stay-message-send';
import type { HouseId } from '../../../../src/lib/market/types';

type Env = AgentEnv & { DASHBOARD_PASSWORD?: string };

function houseFrom(value: unknown): HouseId | null {
  return value === 'ranch' || value === 'lindon' || value === 'river' ? value : null;
}

type SentLog = { token: string; sent: Array<{ id: string; at: string; to: string }> };

/**
 * A stay message, sent by hand.
 *
 * The timeline was preview-only until now: a host could see the messages a stay would receive and
 * nothing ever went out. This sends exactly one message, on a day it is appropriate for, to one guest,
 * and records that it went.
 *
 * Nothing is scheduled. A sender that fires on its own would email a guest at the wrong moment with
 * nobody watching, and "checkout is tomorrow" is a judgement about a real house.
 *
 * The stay comes from the guest record behind the token, never from the request body, so the dates a
 * message is judged against cannot be spoofed by the caller.
 */
export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  const token = String(params.token ?? '');
  let survey;
  try {
    survey = await findSurveyByToken(env, token);
  } catch {
    return corsJson(request, { ready: null, line: null, sent: null, storageReads: 'paused' }, 503);
  }
  if (!survey) return corsJson(request, { error: 'That stay is not on file.' }, 404);
  const house = houseFrom(survey.propertyId);
  if (!house) return corsJson(request, { error: 'That stay does not name a house.' }, 400);

  const sent = await sentFor(env, token).catch(() => null);
  if (sent === null) {
    // The guard cannot tell a duplicate from a first send, so it refuses rather than risking a repeat.
    return corsJson(request, { error: 'The sent-message log could not be read, so nothing was sent.' }, 503);
  }
  const already = sent.map((row) => row.id);
  // Whether the guest app is on decides whether a message may point at the stay page.
  const guestAppOn = await guideEnabled(env, house).catch(() => false);
  const ready = sendableToday({
    house,
    checkIn: survey.checkIn,
    checkOut: survey.checkOut,
    asOf: denverToday(),
    alreadySent: already,
    guestAppOn,
  });
  return corsJson(
    request,
    {
      ready: ready.map((message) => ({ id: message.id, when: message.when, subject: message.subject })),
      line: sendableLine(ready, already),
      sent,
      guestAppOn,
      storageReads: 'ok',
    },
    200,
    { 'Cache-Control': 'no-store' },
  );
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  const token = String(params.token ?? '');
  let body: { id?: unknown; to?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return corsJson(request, { error: 'Invalid JSON' }, 400);
  }
  const id = typeof body.id === 'string' ? body.id.trim() : '';
  const to = typeof body.to === 'string' ? body.to.trim() : '';
  if (!id) return corsJson(request, { error: 'Choose which message to send.' }, 400);
  if (!to.includes('@')) return corsJson(request, { error: 'Add the guest email first.' }, 400);

  let survey;
  try {
    survey = await findSurveyByToken(env, token);
  } catch {
    return corsJson(request, { error: 'The stay could not be read, so nothing was sent.' }, 503);
  }
  if (!survey) return corsJson(request, { error: 'That stay is not on file.' }, 404);
  const house = houseFrom(survey.propertyId);
  if (!house) return corsJson(request, { error: 'That stay does not name a house.' }, 400);

  const sentLog = await sentFor(env, token).catch(() => null);
  if (sentLog === null) {
    // Same reasoning as the read: a duplicate cannot be ruled out, so nothing goes out.
    return corsJson(request, { error: 'The sent-message log could not be read, so nothing was sent.' }, 503);
  }
  const alreadySent = sentLog.map((row) => row.id);
  const guestAppOn = await guideEnabled(env, house).catch(() => false);
  const check = canSendMessage({
    house,
    checkIn: survey.checkIn,
    checkOut: survey.checkOut,
    id,
    asOf: denverToday(),
    alreadySent,
    guestAppOn,
  });
  if (!check.ok) return corsJson(request, { error: check.reason, refused: true }, 409);

  const sent = await gmailSend(env, to, check.message.subject, check.message.body);
  if (sent.error) return corsJson(request, { error: `The message did not send: ${sent.error}` }, 502);

  // Recorded only after it actually went, so a failed send is not remembered as delivered.
  const log = await recordSent(env, token, { id: check.message.id, at: new Date().toISOString(), to });
  await updateReservation(env, survey.reservationId, { guestEmail: to }).catch(() => null);

  return corsJson(
    request,
    {
      ok: true,
      id: check.message.id,
      subject: check.message.subject,
      to,
      line: `Sent "${check.message.subject}" to the guest. Nothing else was sent.`,
      sent: log,
    },
    200,
    { 'Cache-Control': 'no-store' },
  );
};

/**
 * What has already gone to this stay.
 *
 * A read failure is **not** an empty list. The guard uses this to decide whether a message is a
 * duplicate, so returning `[]` on a failed read tells it nothing was ever sent — and the same week-
 * before email goes to the guest a second time. That is why this throws: the caller refuses the send
 * rather than guessing.
 */
async function sentFor(env: Env, token: string): Promise<SentLog['sent']> {
  const raw = (await env.SETTINGS?.get('stayMessageLog')) ?? '[]';
  let parsed: unknown;
  try {
    parsed = JSON.parse(typeof raw === 'string' ? raw : '[]');
  } catch {
    // A log that will not parse is also not a clean slate.
    throw new Error('The sent-message log could not be read.');
  }
  if (!Array.isArray(parsed)) throw new Error('The sent-message log could not be read.');
  const mine = parsed.find(
    (row) => Boolean(row) && typeof row === 'object' && (row as SentLog).token === token,
  ) as SentLog | undefined;
  return Array.isArray(mine?.sent) ? mine.sent : [];
}

async function recordSent(
  env: Env,
  token: string,
  row: { id: string; at: string; to: string },
): Promise<SentLog['sent']> {
  const raw = (await env.SETTINGS?.get('stayMessageLog')) ?? '[]';
  let rows: SentLog[] = [];
  try {
    const parsed = JSON.parse(typeof raw === 'string' ? raw : '[]') as unknown;
    if (Array.isArray(parsed)) {
      rows = parsed.filter(
        (entry): entry is SentLog =>
          Boolean(entry) && typeof entry === 'object' && typeof (entry as SentLog).token === 'string',
      );
    }
  } catch {
    rows = [];
  }
  const existing = rows.find((entry) => entry.token === token);
  const next = existing
    ? rows.map((entry) => (entry.token === token ? { ...entry, sent: [...(entry.sent ?? []), row] } : entry))
    : [...rows, { token, sent: [row] }];
  // Bounded so the key cannot grow without limit. Newest kept.
  await env.SETTINGS?.put('stayMessageLog', JSON.stringify(next.slice(-500)));
  return next.find((entry) => entry.token === token)?.sent ?? [row];
}

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
