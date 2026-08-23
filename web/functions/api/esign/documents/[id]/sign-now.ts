import { corsJson } from '../../../../_lib/data';
import { completeEsignPackage, markSessionCompleted } from '../../../../_lib/esign/complete-esign';
import {
  getVaultDocument,
  newSessionId,
  randomViewerToken,
  saveEsignSession,
  sessionExpiresAt,
  updateVaultDocument,
} from '../../../../_lib/esign/esign-store';
import type { FirebaseStorageEnv } from '../../../../_lib/gcs';
import type { SettingsEnv } from '../../../../_lib/kv';

type Env = SettingsEnv & FirebaseStorageEnv;

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  const id = String(params.id ?? '');
  const doc = await getVaultDocument(env, id);
  if (!doc) return corsJson(request, { error: 'Not found' }, 404);
  if (doc.status === 'completed') {
    return corsJson(request, { error: 'This document is already signed.' }, 409);
  }

  const body = (await request.json()) as {
    signerName?: string;
    signatureDataUrl?: string;
    consentAccepted?: boolean;
  };

  const signerName = (body.signerName ?? doc.signerName ?? 'Utah Mountain Luxury staff').trim();
  if (!body.signatureDataUrl) return corsJson(request, { error: 'Signature required.' }, 400);
  if (!body.consentAccepted) return corsJson(request, { error: 'Consent is required.' }, 400);

  const sessionId = doc.sessionId || newSessionId();
  const viewerToken = doc.viewerToken || randomViewerToken();
  const now = new Date().toISOString();
  await saveEsignSession(env, {
    id: sessionId,
    documentId: doc.id,
    viewerToken,
    signerName,
    signerEmail: doc.signerEmail,
    createdAt: doc.sentAt ?? now,
    expiresAt: sessionExpiresAt(),
  });

  try {
    const completed = await completeEsignPackage(env, {
      documentId: doc.id,
      sessionId,
      signerName,
      signerEmail: doc.signerEmail,
      signatureDataUrl: body.signatureDataUrl,
      consentAccepted: true,
      ip: request.headers.get('CF-Connecting-IP') ?? undefined,
      userAgent: request.headers.get('User-Agent') ?? undefined,
    });
    await markSessionCompleted(env, sessionId, completed.completedAt ?? now);
    const withSession = await updateVaultDocument(env, completed.id, { sessionId, viewerToken });
    return corsJson(request, withSession ?? completed);
  } catch (e) {
    return corsJson(request, { error: e instanceof Error ? e.message : 'Sign failed' }, 400);
  }
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
