import { corsJson } from '../../../_lib/data';
import { decodeBase64Receipt, storageConfigured } from '../../../_lib/gcs';
import { loadGmailTokens } from '../../../_lib/gmail-store';
import { isTwilioConfigured, twilioFromNumber } from '../../../_lib/twilio-sms';
import { ESIGN_MAX_MB } from '../../../_lib/esign/esign-file-kv';
import { storeEsignFile } from '../../../_lib/esign/esign-file-store';
import { addVaultDocument, loadVaultDocuments, newEsignDocId } from '../../../_lib/esign/esign-store';
import { isPropertyScope, isSignerRole, isVaultFolder } from '../../../_lib/esign/types';
import type { FirebaseStorageEnv } from '../../../_lib/gcs';
import type { SettingsEnv } from '../../../_lib/kv';

type Env = SettingsEnv & FirebaseStorageEnv;

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const [documents, gmail] = await Promise.all([loadVaultDocuments(env), loadGmailTokens(env)]);
  return corsJson(request, {
    documents,
    limits: { maxMb: ESIGN_MAX_MB, firebaseConfigured: storageConfigured(env) },
    gmail: {
      connected: Boolean(gmail),
      email: gmail?.email ?? null,
      oauthConfigured: Boolean(env.GOOGLE_OAUTH_CLIENT_ID?.trim() && env.GOOGLE_OAUTH_CLIENT_SECRET?.trim()),
    },
    sms: { configured: isTwilioConfigured(env), from: twilioFromNumber(env) },
  });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const body = (await request.json()) as {
      fileBase64?: string;
      mimeType?: string;
      fileName?: string;
      title?: string;
      folder?: string;
      notes?: string;
      propertyId?: string;
      signerName?: string;
      signerEmail?: string;
      signerPhone?: string;
      signerRole?: string;
    };

    if (!body.fileBase64 || !body.mimeType) {
      return corsJson(request, { error: 'fileBase64 and mimeType required' }, 400);
    }

    try {
      decodeBase64Receipt(body.fileBase64);
    } catch {
      return corsJson(request, { error: 'Invalid file data' }, 400);
    }

    const docId = newEsignDocId();
    const stored = await storeEsignFile(env, docId, body.fileBase64, body.mimeType);
    if (!stored.storagePath) {
      return corsJson(
        request,
        { error: stored.warning ?? 'Could not save file.', code: 'storage_failed' },
        422,
      );
    }

    const fileName = body.fileName?.trim() || 'document';
    const title = body.title?.trim() || fileName.replace(/\.[^.]+$/, '');
    const doc = await addVaultDocument(env, {
      id: docId,
      title,
      folder: isVaultFolder(body.folder) ? body.folder : 'esign',
      status: 'stored',
      sourceFileName: fileName,
      contentType: stored.contentType,
      storagePath: stored.storagePath,
      uploadedAt: new Date().toISOString(),
      notes: body.notes?.trim() || undefined,
      propertyId: isPropertyScope(body.propertyId) ? body.propertyId : 'all',
      signerName: body.signerName?.trim() || undefined,
      signerEmail: body.signerEmail?.trim() || undefined,
      signerPhone: body.signerPhone?.trim() || undefined,
      signerRole: isSignerRole(body.signerRole) ? body.signerRole : undefined,
    });

    return corsJson(request, doc, 201);
  } catch (e) {
    return corsJson(request, { error: e instanceof Error ? e.message : 'Upload failed' }, 500);
  }
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
