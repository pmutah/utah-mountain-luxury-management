import { corsJson } from '../../../_lib/data';
import {
  loadConstructionDocuments,
  addConstructionDocument,
  newConstructionDocId,
} from '../../../_lib/construction/construction-store';
import { ingestConstructionDocument } from '../../../_lib/construction/construction-ingest';
import { storeConstructionFile } from '../../../_lib/construction/construction-doc-store';
import type { ConstructionEnv } from '../../../_lib/construction/types';

export const onRequestGet: PagesFunction<ConstructionEnv> = async ({ request, env }) => {
  const documents = await loadConstructionDocuments(env);
  return corsJson(request, { documents });
};

export const onRequestPost: PagesFunction<ConstructionEnv> = async ({ request, env }) => {
  const apiKey = env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return corsJson(request, { error: 'GEMINI_API_KEY not configured' }, 503);
  }

  const body = (await request.json()) as {
    fileBase64?: string;
    mimeType?: string;
    fileName?: string;
    type?: string;
  };

  if (!body.fileBase64 || !body.mimeType) {
    return corsJson(request, { error: 'fileBase64 and mimeType required' }, 400);
  }

  const docId = newConstructionDocId();
  const stored = await storeConstructionFile(env, docId, body.fileBase64, body.mimeType);

  let ingest;
  try {
    ingest = await ingestConstructionDocument(
      apiKey,
      body.fileBase64,
      body.mimeType,
      body.fileName,
    );
  } catch (e) {
    return corsJson(
      request,
      { error: e instanceof Error ? e.message : 'Ingest failed', storageWarning: stored.warning },
      422,
    );
  }

  if (body.type && ingest.type === 'other') {
    const t = body.type as typeof ingest.type;
    if (['plan', 'invoice', 'estimate', 'bid', 'contract', 'engineering', 'other'].includes(t)) {
      ingest.type = t;
    }
  }

  const doc = await addConstructionDocument(env, {
    id: docId,
    type: ingest.type,
    title: ingest.title,
    vendor: ingest.vendor,
    amount: ingest.amount,
    documentDate: ingest.documentDate,
    trade: ingest.trade,
    stage: ingest.stage,
    storagePath: stored.storagePath || null,
    contentType: stored.contentType,
    uploadedAt: new Date().toISOString(),
    extractedSummary: ingest.extractedSummary,
    extractedFields: ingest.extractedFields,
    sourceFileName: body.fileName,
  });

  return corsJson(
    request,
    { ...doc, ingestWarning: stored.warning },
    201,
  );
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
