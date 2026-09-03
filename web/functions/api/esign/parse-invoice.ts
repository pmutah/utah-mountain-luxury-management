import { corsJson } from '../../_lib/data';
import {
  applyParsedInvoice,
  parseInvoiceFromParts,
  resolveParseTemplate,
} from '../../_lib/esign/parse-invoice';
import { gmailGetInvoiceSource, gmailSearchHeaders } from '../../_lib/gmail-store';
import type { SettingsEnv } from '../../_lib/kv';

interface Env extends SettingsEnv {
  GEMINI_API_KEY?: string;
}

const DEFAULT_GMAIL_QUERY = 'invoice OR "pay application" OR "pay app" newer_than:180d';

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const body = (await request.json()) as {
    type?: 'text' | 'image' | 'gmail' | 'gmail-search';
    text?: string;
    imageBase64?: string;
    mimeType?: string;
    templateId?: string;
    query?: string;
    messageId?: string;
  };

  if (body.type === 'gmail-search') {
    try {
      const messages = await gmailSearchHeaders(env, (body.query ?? DEFAULT_GMAIL_QUERY).trim() || DEFAULT_GMAIL_QUERY, 8);
      return corsJson(request, { messages });
    } catch (e) {
      return corsJson(request, { error: e instanceof Error ? e.message : 'Gmail search failed' }, 422);
    }
  }

  const apiKey = env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return corsJson(request, { error: 'GEMINI_API_KEY not configured on server' }, 503);
  }

  try {
    const template = resolveParseTemplate(body.templateId);
    let text = body.text?.trim();
    let imageBase64 = body.imageBase64;
    let mimeType = body.mimeType;
    let extraNote = `Selected form: ${template.title}.`;

    if (body.type === 'gmail') {
      if (!body.messageId?.trim()) {
        return corsJson(request, { error: 'Pick an email to import.' }, 400);
      }
      const source = await gmailGetInvoiceSource(env, body.messageId.trim());
      text = source.text;
      if (source.attachment) {
        imageBase64 = source.attachment.data;
        mimeType = source.attachment.mimeType;
      }
      extraNote += ` Email subject: ${source.subject}. From: ${source.from}.`;
    } else if (body.type === 'image') {
      if (!imageBase64 || !mimeType) {
        return corsJson(request, { error: 'imageBase64 and mimeType required' }, 400);
      }
    } else if (!text) {
      return corsJson(request, { error: 'Paste an email or attach an invoice.' }, 400);
    }

    const parsed = await parseInvoiceFromParts(apiKey, { text, imageBase64, mimeType, extraNote });
    const applied = applyParsedInvoice(template, parsed);
    return corsJson(request, {
      fields: applied.values,
      missing: applied.missing,
      parsed,
      templateId: template.id,
    });
  } catch (e) {
    return corsJson(request, { error: e instanceof Error ? e.message : 'Could not read that invoice' }, 422);
  }
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
