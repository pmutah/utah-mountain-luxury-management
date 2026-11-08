import { hostDenied, hostOnly } from '../../_lib/auth';
import { corsJson } from '../../_lib/data';
import { readJsonBody } from '../../_lib/json-body';
import { parseExpensesFromDocument } from '../../_lib/gemini';
import type { SettingsEnv } from '../../_lib/kv';

interface ScanBatchEnv extends SettingsEnv {
  GEMINI_API_KEY?: string;
}

export const onRequestPost: PagesFunction<ScanBatchEnv> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  const apiKey = env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return corsJson(request, { error: 'GEMINI_API_KEY not configured on server' }, 503);
  }

  const parsed = await readJsonBody<{
    fileBase64?: string;
    mimeType?: string;
    fileName?: string;
  }>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

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
