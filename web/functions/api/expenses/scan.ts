import { corsJson } from '../../_lib/data';
import { parseExpenseFromImage, parseExpenseFromText } from '../../_lib/gemini';
import {
  parseHouseholdExpenseFromImage,
  parseHouseholdExpenseFromText,
} from '../../_lib/gemini-household';
import type { SettingsEnv } from '../../_lib/kv';

interface ScanEnv extends SettingsEnv {
  GEMINI_API_KEY?: string;
}

export const onRequestPost: PagesFunction<ScanEnv> = async ({ request, env }) => {
  const apiKey = env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return corsJson(request, { error: 'GEMINI_API_KEY not configured on server' }, 503);
  }

  const body = (await request.json()) as {
    type: 'text' | 'image';
    text?: string;
    imageBase64?: string;
    mimeType?: string;
    propertyId?: 'ranch' | 'lindon' | 'river' | 'household';
    month?: string;
  };

  const household = body.propertyId === 'household';
  const hints = { propertyId: household ? undefined : body.propertyId, month: body.month };

  try {
    let parsed;
    if (body.type === 'image') {
      if (!body.imageBase64 || !body.mimeType) {
        return corsJson(request, { error: 'imageBase64 and mimeType required' }, 400);
      }
      parsed = household
        ? await parseHouseholdExpenseFromImage(apiKey, body.imageBase64, body.mimeType, {
            month: body.month,
          })
        : await parseExpenseFromImage(apiKey, body.imageBase64, body.mimeType, hints);
    } else {
      if (!body.text?.trim()) {
        return corsJson(request, { error: 'text required' }, 400);
      }
      parsed = household
        ? await parseHouseholdExpenseFromText(apiKey, body.text.trim(), { month: body.month })
        : await parseExpenseFromText(apiKey, body.text.trim(), hints);
    }

    const propertyId = household ? 'household' : (parsed.propertyId ?? body.propertyId ?? null);
    return corsJson(request, {
      ...parsed,
      propertyId,
      month: parsed.month,
    });
  } catch (e) {
    return corsJson(
      request,
      { error: e instanceof Error ? e.message : 'Scan failed' },
      422,
    );
  }
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
