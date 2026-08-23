import type { SettingsEnv } from '../kv';
import type { FirebaseStorageEnv } from '../gcs';
import {
  buildEsignCertificatePdf,
  buildSignatureAcknowledgmentPage,
  decodeDataUrlPng,
  imageToPdf,
  mergePdfBuffers,
} from './certificate';
import { loadEsignFile, storeEsignBytes } from './esign-file-store';
import { getEsignSession, getVaultDocument, saveEsignSession, updateVaultDocument } from './esign-store';
import { FOLDER_LABELS, type VaultDocument } from './types';

export type CompleteEsignInput = {
  documentId: string;
  sessionId: string;
  signerName: string;
  signerEmail?: string;
  signatureDataUrl: string;
  consentAccepted: boolean;
  ip?: string;
  userAgent?: string;
};

const PROPERTY_LABELS: Record<string, string> = {
  all: 'Portfolio',
  ranch: 'The Ranch House',
  lindon: 'The Lindon House',
  river: 'The River House',
  construction: 'Construction Project',
};

export async function completeEsignPackage(
  env: SettingsEnv & FirebaseStorageEnv,
  input: CompleteEsignInput,
): Promise<VaultDocument> {
  if (!input.consentAccepted) {
    throw new Error('Consent is required to complete e-sign.');
  }
  const signaturePng = decodeDataUrlPng(input.signatureDataUrl);
  if (!signaturePng) {
    throw new Error('A drawn signature is required.');
  }

  const doc = await getVaultDocument(env, input.documentId);
  if (!doc?.storagePath) throw new Error('Document file not found.');

  const original = await loadEsignFile(env, doc.storagePath);
  const completedAt = new Date().toISOString();

  let sourcePdf: Uint8Array;
  if (original.contentType === 'application/pdf') {
    sourcePdf = original.bytes;
  } else if (original.contentType.startsWith('image/')) {
    sourcePdf = await imageToPdf(original.bytes, original.contentType);
  } else {
    throw new Error('Only PDF or image documents can be signed.');
  }

  const ack = await buildSignatureAcknowledgmentPage({
    signerName: input.signerName,
    signedAt: completedAt,
    documentTitle: doc.title,
    signaturePng,
  });

  const certificate = await buildEsignCertificatePdf({
    sessionId: input.sessionId,
    documentTitle: doc.title,
    folderLabel: FOLDER_LABELS[doc.folder],
    propertyLabel: PROPERTY_LABELS[doc.propertyId ?? 'all'],
    completedAt,
    signerIp: input.ip,
    signers: [
      {
        role: doc.signerRole ?? 'Signer',
        name: input.signerName,
        email: input.signerEmail ?? doc.signerEmail,
        completedAt,
      },
    ],
  });

  const signedPdf = await mergePdfBuffers([sourcePdf, ack, certificate]);
  const signedId = `${doc.id}-signed`;
  const stored = await storeEsignBytes(env, signedId, signedPdf, 'application/pdf');
  if (!stored.storagePath) {
    throw new Error(stored.warning ?? 'Could not store the signed PDF.');
  }

  const updated = await updateVaultDocument(env, doc.id, {
    status: 'completed',
    signedStoragePath: stored.storagePath,
    completedAt,
    consentAcceptedAt: completedAt,
    signerName: input.signerName,
    signerEmail: input.signerEmail ?? doc.signerEmail,
    signerIp: input.ip,
    signerUserAgent: input.userAgent,
  });
  if (!updated) throw new Error('Failed to update document.');
  return updated;
}

export async function markSessionCompleted(
  env: SettingsEnv,
  sessionId: string,
  completedAt: string,
): Promise<void> {
  const session = await getEsignSession(env, sessionId);
  if (!session) return;
  await saveEsignSession(env, { ...session, completedAt });
}
