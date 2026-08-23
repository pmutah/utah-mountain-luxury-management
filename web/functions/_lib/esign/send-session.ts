import { gmailSend } from '../gmail-store';
import { sendTwilioSms } from '../twilio-sms';
import type { SettingsEnv } from '../kv';
import { esignEmailBody, esignEmailSubject, esignSmsBody } from './esign-copy';
import {
  getEsignSession,
  isSessionOpen,
  newSessionId,
  publicSignUrl,
  randomViewerToken,
  saveEsignSession,
  sessionExpiresAt,
  updateVaultDocument,
} from './esign-store';
import type { VaultDocument } from './types';

export type EsignSendChannel = 'email' | 'sms' | 'none';

export async function startSigningSession(
  env: SettingsEnv,
  doc: VaultDocument,
  origin: string,
  input: {
    signerName: string;
    signerEmail?: string;
    signerPhone?: string;
    channel?: EsignSendChannel;
  },
): Promise<{
  document: VaultDocument | null;
  link: string;
  emailed: boolean;
  texted: boolean;
}> {
  const channel = input.channel ?? 'none';
  const signerEmail = input.signerEmail?.trim() || undefined;
  const signerPhone = input.signerPhone?.trim() || undefined;

  if (channel === 'email' && !signerEmail) {
    throw new Error('Add a contractor email to send the signing link.');
  }
  if (channel === 'sms' && !signerPhone) {
    throw new Error('Add a contractor phone to text the signing link.');
  }

  let viewerToken = doc.viewerToken;
  let sessionId = doc.sessionId;
  const existing = sessionId ? await getEsignSession(env, sessionId) : null;
  if (!existing || !isSessionOpen(existing) || !viewerToken) {
    sessionId = newSessionId();
    viewerToken = randomViewerToken();
    await saveEsignSession(env, {
      id: sessionId,
      documentId: doc.id,
      viewerToken,
      signerName: input.signerName,
      signerEmail,
      signerPhone,
      createdAt: new Date().toISOString(),
      expiresAt: sessionExpiresAt(),
    });
  }

  const link = publicSignUrl(origin, viewerToken);
  let emailed = false;
  let texted = false;

  if (channel === 'email' && signerEmail) {
    const sent = await gmailSend(
      env,
      signerEmail,
      esignEmailSubject(doc.title),
      esignEmailBody({
        signerName: input.signerName,
        documentTitle: doc.title,
        link,
        notes: doc.notes,
      }),
    );
    if (sent.error) throw new Error(sent.error);
    emailed = true;
  }

  if (channel === 'sms' && signerPhone) {
    const sent = await sendTwilioSms(
      env,
      signerPhone,
      esignSmsBody({
        signerName: input.signerName,
        documentTitle: doc.title,
        link,
      }),
    );
    if (sent.error) throw new Error(sent.error);
    texted = true;
  }

  const document = await updateVaultDocument(env, doc.id, {
    status: 'pending',
    sessionId,
    viewerToken,
    signerName: input.signerName,
    signerEmail,
    signerPhone,
    sentAt: new Date().toISOString(),
    sentChannel: channel === 'none' ? undefined : channel,
    cancelledAt: undefined,
  });
  return { document, link, emailed, texted };
}
