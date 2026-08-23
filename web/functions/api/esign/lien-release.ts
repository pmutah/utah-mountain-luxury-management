import { corsJson } from '../../_lib/data';
import {
  buildLienReleasePdf,
  formatUsd,
  JM_LT_LIEN_RELEASE,
  RIVER_LIEN_PROPERTY,
} from '../../_lib/esign/lien-release';
import { storeEsignBytes } from '../../_lib/esign/esign-file-store';
import { addVaultDocument, newEsignDocId } from '../../_lib/esign/esign-store';
import { startSigningSession } from '../../_lib/esign/send-session';
import type { LienReleaseFields } from '../../_lib/esign/types';
import type { FirebaseStorageEnv } from '../../_lib/gcs';
import type { SettingsEnv } from '../../_lib/kv';

type Env = SettingsEnv & FirebaseStorageEnv;

export const onRequestGet: PagesFunction<Env> = async ({ request }) => {
  return corsJson(request, {
    property: RIVER_LIEN_PROPERTY,
    example: JM_LT_LIEN_RELEASE,
  });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const body = (await request.json()) as Partial<LienReleaseFields> & {
      sendEmail?: boolean;
      sendChannel?: 'email' | 'sms' | 'none';
      preset?: string;
    };

    const preset = body.preset === 'jm-lt' ? JM_LT_LIEN_RELEASE : null;
    const fields: LienReleaseFields = {
      contractorName: (body.contractorName ?? preset?.contractorName ?? '').trim(),
      contractorAddress: (body.contractorAddress ?? preset?.contractorAddress)?.trim() || undefined,
      phone: (body.phone ?? preset?.phone)?.trim() || undefined,
      email: (body.email ?? preset?.email)?.trim() || undefined,
      invoiceNo: (body.invoiceNo ?? preset?.invoiceNo)?.trim() || undefined,
      invoiceDate: (body.invoiceDate ?? preset?.invoiceDate)?.trim() || undefined,
      description: (body.description ?? preset?.description ?? '').trim(),
      amountUsd: Number(body.amountUsd ?? preset?.amountUsd ?? 0),
    };

    if (!fields.contractorName) return corsJson(request, { error: 'Contractor name is required.' }, 400);
    if (!fields.description) return corsJson(request, { error: 'Work description is required.' }, 400);
    if (!Number.isFinite(fields.amountUsd) || fields.amountUsd <= 0) {
      return corsJson(request, { error: 'Final payment amount must be greater than zero.' }, 400);
    }

    const pdf = await buildLienReleasePdf(fields);
    const docId = newEsignDocId();
    const stored = await storeEsignBytes(env, docId, pdf, 'application/pdf');
    if (!stored.storagePath) {
      return corsJson(request, { error: stored.warning ?? 'Could not store the lien release.' }, 422);
    }

    const invoiceBit = fields.invoiceNo ? ` Inv ${fields.invoiceNo}` : '';
    const title = `Lien release - ${fields.contractorName}${invoiceBit}`;
    let doc = await addVaultDocument(env, {
      id: docId,
      title,
      folder: 'contractor',
      status: 'stored',
      sourceFileName: `${title.replace(/[^\w.-]+/g, '_')}.pdf`,
      contentType: 'application/pdf',
      storagePath: stored.storagePath,
      uploadedAt: new Date().toISOString(),
      propertyId: 'river',
      signerName: fields.contractorName,
      signerEmail: fields.email,
      signerPhone: fields.phone,
      signerRole: 'contractor',
      kind: 'lien-release',
      lienRelease: fields,
      notes: `River House Utah § 38-1a-802 final-payment release · ${formatUsd(fields.amountUsd)}`,
    });

    const channel = body.sendChannel ?? (body.sendEmail ? 'email' : 'none');
    let link: string | undefined;
    let emailed = false;
    let texted = false;
    if (channel !== 'none') {
      const started = await startSigningSession(env, doc, new URL(request.url).origin, {
        signerName: fields.contractorName,
        signerEmail: fields.email,
        signerPhone: fields.phone,
        channel,
      });
      doc = started.document ?? doc;
      link = started.link;
      emailed = started.emailed;
      texted = started.texted;
    }

    return corsJson(request, { document: doc, link, emailed, texted, property: RIVER_LIEN_PROPERTY }, 201);
  } catch (e) {
    return corsJson(request, { error: e instanceof Error ? e.message : 'Could not create lien release' }, 500);
  }
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
