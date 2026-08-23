import { corsJson } from '../../../_lib/data';
import { completeEsignPackage, markSessionCompleted } from '../../../_lib/esign/complete-esign';
import {
  findSessionByToken,
  getVaultDocument,
  isSessionOpen,
} from '../../../_lib/esign/esign-store';
import { FOLDER_LABELS } from '../../../_lib/esign/types';
import type { FirebaseStorageEnv } from '../../../_lib/gcs';
import type { SettingsEnv } from '../../../_lib/kv';

type Env = SettingsEnv & FirebaseStorageEnv;

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  const token = String(params.token ?? '');
  const session = await findSessionByToken(env, token);
  if (!session) return corsJson(request, { error: 'This signing link is not valid.' }, 404);

  const doc = await getVaultDocument(env, session.documentId);
  if (!doc) return corsJson(request, { error: 'This document is no longer available.' }, 404);

  const expired = !isSessionOpen(session) && !session.completedAt;
  return corsJson(request, {
    title: doc.title,
    folderLabel: FOLDER_LABELS[doc.folder],
    signerName: session.signerName,
    completed: Boolean(session.completedAt || doc.completedAt),
    expired,
    cancelled: Boolean(session.cancelledAt || doc.status === 'cancelled'),
  });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  const token = String(params.token ?? '');
  const session = await findSessionByToken(env, token);
  if (!session) return corsJson(request, { error: 'This signing link is not valid.' }, 404);
  if (session.completedAt) return corsJson(request, { error: 'This document is already signed.' }, 409);
  if (!isSessionOpen(session)) {
    return corsJson(request, { error: 'This signing link has expired or was cancelled.' }, 410);
  }

  const body = (await request.json()) as {
    signerName?: string;
    signatureDataUrl?: string;
    consentAccepted?: boolean;
  };

  const signerName = (body.signerName ?? session.signerName ?? '').trim();
  if (!signerName) return corsJson(request, { error: 'Type your full name.' }, 400);
  if (!body.signatureDataUrl) return corsJson(request, { error: 'Draw your signature.' }, 400);
  if (!body.consentAccepted) return corsJson(request, { error: 'Consent is required.' }, 400);

  try {
    const completed = await completeEsignPackage(env, {
      documentId: session.documentId,
      sessionId: session.id,
      signerName,
      signerEmail: session.signerEmail,
      signatureDataUrl: body.signatureDataUrl,
      consentAccepted: true,
      ip: request.headers.get('CF-Connecting-IP') ?? undefined,
      userAgent: request.headers.get('User-Agent') ?? undefined,
    });
    await markSessionCompleted(env, session.id, completed.completedAt ?? new Date().toISOString());
    return corsJson(request, { ok: true, completedAt: completed.completedAt });
  } catch (e) {
    return corsJson(request, { error: e instanceof Error ? e.message : 'Sign failed' }, 400);
  }
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
