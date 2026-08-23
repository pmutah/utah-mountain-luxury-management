import { corsJson } from '../../../../_lib/data';
import { getVaultDocument } from '../../../../_lib/esign/esign-store';
import { startSigningSession } from '../../../../_lib/esign/send-session';
import type { SettingsEnv } from '../../../../_lib/kv';

export const onRequestPost: PagesFunction<SettingsEnv> = async ({ request, env, params }) => {
  const id = String(params.id ?? '');
  const doc = await getVaultDocument(env, id);
  if (!doc) return corsJson(request, { error: 'Not found' }, 404);
  if (!doc.storagePath) return corsJson(request, { error: 'Document file is missing.' }, 422);
  if (doc.status === 'completed') {
    return corsJson(request, { error: 'This document is already signed.' }, 409);
  }

  const body = (await request.json().catch(() => ({}))) as {
    signerName?: string;
    signerEmail?: string;
    signerPhone?: string;
    channel?: 'email' | 'sms' | 'none';
    sendEmail?: boolean;
  };

  const signerName = (body.signerName ?? doc.signerName ?? '').trim();
  const signerEmail = (body.signerEmail ?? doc.signerEmail ?? '').trim();
  const signerPhone = (body.signerPhone ?? doc.signerPhone ?? doc.lienRelease?.phone ?? '').trim();
  if (!signerName) return corsJson(request, { error: 'Add a signer name first.' }, 400);
  const channel = body.channel ?? (body.sendEmail === false ? 'none' : body.sendEmail ? 'email' : 'none');

  try {
    const result = await startSigningSession(env, doc, new URL(request.url).origin, {
      signerName,
      signerEmail: signerEmail || undefined,
      signerPhone: signerPhone || undefined,
      channel,
    });
    return corsJson(request, result);
  } catch (e) {
    return corsJson(request, { error: e instanceof Error ? e.message : 'Send failed' }, 502);
  }
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
