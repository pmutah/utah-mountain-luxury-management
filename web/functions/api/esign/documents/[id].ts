import { hostDenied, hostOnly } from '../../../_lib/auth';
import { corsJson } from '../../../_lib/data';
import { readJsonBody } from '../../../_lib/json-body';
import { deleteEsignStoredFile } from '../../../_lib/esign/esign-file-store';
import { readOrRefuse } from '../../../_lib/read-guard';
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
  if (!hostOnly(request, env)) return hostDenied(request, env);
  const read = await readOrRefuse(request, () => getVaultDocument(env, String(params.id ?? '')), 'The document vault');
  if (!read.ok) return read.response;
  if (!read.value) return corsJson(request, { error: 'Not found' }, 404);
  return corsJson(request, read.value);
};

export const onRequestPatch: PagesFunction<Env> = async ({ request, env, params }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  const id = String(params.id ?? '');
  const parsed = await readJsonBody<{
    title?: string;
    folder?: string;
    notes?: string;
    propertyId?: string;
    signerName?: string;
    signerEmail?: string;
    signerPhone?: string;
    signerRole?: string;
    status?: string;
  }>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

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

  const read = await readOrRefuse(request, () => updateVaultDocument(env, id, patch), 'The document vault');
  if (!read.ok) return read.response;
  const updated = read.value;
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
  if (!hostOnly(request, env)) return hostDenied(request, env);
  const read = await readOrRefuse(request, () => deleteVaultDocument(env, String(params.id ?? '')), 'The document vault');
  if (!read.ok) return read.response;
  const doc = read.value;
  if (!doc) return corsJson(request, { error: 'Not found' }, 404);
  await deleteEsignStoredFile(env, doc.storagePath).catch(() => {});
  await deleteEsignStoredFile(env, doc.signedStoragePath ?? null).catch(() => {});
  return corsJson(request, { ok: true });
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
