import { hostDenied, hostOnly } from '../../../../_lib/auth';
import { corsJson } from '../../../../_lib/data';
import { getVaultDocument } from '../../../../_lib/esign/esign-store';
import { readOrRefuse } from '../../../../_lib/read-guard';
import { startSigningSession } from '../../../../_lib/esign/send-session';
import type { SettingsEnv } from '../../../../_lib/kv';

export const onRequestPost: PagesFunction<SettingsEnv> = async ({ request, env, params }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  const id = String(params.id ?? '');
  const found = await readOrRefuse(request, () => getVaultDocument(env, id), 'The document vault');
  if (!found.ok) return found.response;
  const doc = found.value;
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
