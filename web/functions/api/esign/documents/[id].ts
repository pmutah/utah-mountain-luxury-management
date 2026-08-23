import { corsJson } from '../../../_lib/data';
import { deleteEsignStoredFile } from '../../../_lib/esign/esign-file-store';
import {
  deleteVaultDocument,
  getEsignSession,
  getVaultDocument,
  saveEsignSession,
  updateVaultDocument,
} from '../../../_lib/esign/esign-store';
import { isPropertyScope, isSignerRole, isVaultFolder } from '../../../_lib/esign/types';
import type { FirebaseStorageEnv } from '../../../_lib/gcs';
import type { SettingsEnv } from '../../../_lib/kv';

type Env = SettingsEnv & FirebaseStorageEnv;

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  const doc = await getVaultDocument(env, String(params.id ?? ''));
  if (!doc) return corsJson(request, { error: 'Not found' }, 404);
  return corsJson(request, doc);
};

export const onRequestPatch: PagesFunction<Env> = async ({ request, env, params }) => {
  const id = String(params.id ?? '');
  const body = (await request.json()) as {
    title?: string;
    folder?: string;
    notes?: string;
    propertyId?: string;
    signerName?: string;
    signerEmail?: string;
    signerPhone?: string;
    signerRole?: string;
    status?: string;
  };

  const patch: Parameters<typeof updateVaultDocument>[2] = {};
  if (body.title !== undefined) patch.title = body.title.trim();
  if (isVaultFolder(body.folder)) patch.folder = body.folder;
  if (body.notes !== undefined) patch.notes = body.notes.trim() || undefined;
  if (isPropertyScope(body.propertyId)) patch.propertyId = body.propertyId;
  if (body.signerName !== undefined) patch.signerName = body.signerName.trim() || undefined;
  if (body.signerEmail !== undefined) patch.signerEmail = body.signerEmail.trim() || undefined;
  if (body.signerPhone !== undefined) patch.signerPhone = body.signerPhone.trim() || undefined;
  if (isSignerRole(body.signerRole)) patch.signerRole = body.signerRole;
  if (body.status === 'cancelled') {
    patch.status = 'cancelled';
    patch.cancelledAt = new Date().toISOString();
  }

  const updated = await updateVaultDocument(env, id, patch);
  if (!updated) return corsJson(request, { error: 'Not found' }, 404);
  if (patch.status === 'cancelled' && updated.sessionId) {
    const session = await getEsignSession(env, updated.sessionId);
    if (session && !session.completedAt) {
      await saveEsignSession(env, {
        ...session,
        cancelledAt: patch.cancelledAt ?? new Date().toISOString(),
      });
    }
  }
  return corsJson(request, updated);
};

export const onRequestDelete: PagesFunction<Env> = async ({ request, env, params }) => {
  const doc = await deleteVaultDocument(env, String(params.id ?? ''));
  if (!doc) return corsJson(request, { error: 'Not found' }, 404);
  await deleteEsignStoredFile(env, doc.storagePath).catch(() => {});
  await deleteEsignStoredFile(env, doc.signedStoragePath ?? null).catch(() => {});
  return corsJson(request, { ok: true });
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
