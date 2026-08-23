import { corsJson } from '../../../_lib/data';
import { storeEsignBytes } from '../../../_lib/esign/esign-file-store';
import { addVaultDocument, newEsignDocId } from '../../../_lib/esign/esign-store';
import { getFormTemplate, resolveSite, validateFormValues } from '../../../_lib/esign/form-library';
import { buildFormPdf } from '../../../_lib/esign/form-pdf';
import { startSigningSession } from '../../../_lib/esign/send-session';
import type { LienReleaseFields } from '../../../_lib/esign/types';
import type { FirebaseStorageEnv } from '../../../_lib/gcs';
import type { SettingsEnv } from '../../../_lib/kv';

type Env = SettingsEnv & FirebaseStorageEnv;

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  const template = getFormTemplate(String(params.id ?? ''));
  if (!template) return corsJson(request, { error: 'Unknown form.' }, 404);

  try {
    const body = (await request.json()) as {
      fields?: Record<string, unknown>;
      sendChannel?: 'email' | 'sms' | 'none';
      sendEmail?: boolean;
    };
    const checked = validateFormValues(template, body.fields ?? {});
    if (checked.error) return corsJson(request, { error: checked.error }, 400);

    const values = checked.values;
    const pdf = await buildFormPdf(template.id, values);
    const docId = newEsignDocId();
    const stored = await storeEsignBytes(env, docId, pdf, 'application/pdf');
    if (!stored.storagePath) {
      return corsJson(request, { error: stored.warning ?? 'Could not store the form.' }, 422);
    }

    const signerName = String(values[template.signerField] ?? '').trim();
    const site = resolveSite(values.propertyId);
    const titleBit =
      values.invoiceNo != null && String(values.invoiceNo).trim()
        ? ` - ${values.invoiceNo}`
        : values.amountUsd
          ? ` - ${values.amountUsd}`
          : '';
    const title = `${template.title} - ${signerName || site.name}${titleBit}`;

    const lienRelease: LienReleaseFields | undefined =
      template.id === 'river-final-release'
        ? {
            contractorName: String(values.contractorName ?? ''),
            contractorAddress: values.contractorAddress ? String(values.contractorAddress) : undefined,
            phone: values.phone ? String(values.phone) : undefined,
            email: values.email ? String(values.email) : undefined,
            invoiceNo: values.invoiceNo ? String(values.invoiceNo) : undefined,
            invoiceDate: values.invoiceDate ? String(values.invoiceDate) : undefined,
            description: String(values.description ?? ''),
            amountUsd: Number(values.amountUsd ?? 0),
          }
        : undefined;

    let doc = await addVaultDocument(env, {
      id: docId,
      title,
      folder: template.folder,
      status: 'stored',
      sourceFileName: `${title.replace(/[^\w.-]+/g, '_')}.pdf`,
      contentType: 'application/pdf',
      storagePath: stored.storagePath,
      uploadedAt: new Date().toISOString(),
      propertyId: site.id,
      signerName: signerName || undefined,
      signerEmail: values.email ? String(values.email) : undefined,
      signerPhone: values.phone ? String(values.phone) : undefined,
      signerRole: template.defaultSignerRole,
      kind: template.id === 'river-final-release' ? 'lien-release' : 'form',
      formTemplateId: template.id,
      formValues: values,
      lienRelease,
      notes: `${template.title} - ${site.name}`,
    });

    const channel = body.sendChannel ?? (body.sendEmail ? 'email' : 'none');
    let link: string | undefined;
    let emailed = false;
    let texted = false;
    if (channel !== 'none') {
      const started = await startSigningSession(env, doc, new URL(request.url).origin, {
        signerName: signerName || template.title,
        signerEmail: values.email ? String(values.email) : undefined,
        signerPhone: values.phone ? String(values.phone) : undefined,
        channel,
      });
      doc = started.document ?? doc;
      link = started.link;
      emailed = started.emailed;
      texted = started.texted;
    }

    return corsJson(request, { document: doc, link, emailed, texted, templateId: template.id }, 201);
  } catch (e) {
    return corsJson(request, { error: e instanceof Error ? e.message : 'Could not create form' }, 500);
  }
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
