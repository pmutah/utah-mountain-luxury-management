import { corsJson } from '../../_lib/data';
import { parseExpensesFromDocument } from '../../_lib/gemini';
import type { SettingsEnv } from '../../_lib/kv';

interface ScanBatchEnv extends SettingsEnv {
  GEMINI_API_KEY?: string;
}

export const onRequestPost: PagesFunction<ScanBatchEnv> = async ({ request, env }) => {
  const apiKey = env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return corsJson(request, { error: 'GEMINI_API_KEY not configured on server' }, 503);
  }

  const body = (await request.json()) as {
    fileBase64?: string;
    mimeType?: string;
    fileName?: string;
  };

  if (!body.fileBase64 || !body.mimeType) {
    return corsJson(request, { error: 'fileBase64 and mimeType required' }, 400);
  }

  try {
    const expenses = await parseExpensesFromDocument(
      apiKey,
      body.fileBase64,
      body.mimeType,
      body.fileName,
    );
    return corsJson(request, {
      expenses,
      sourceFile: body.fileName ?? 'document',
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
