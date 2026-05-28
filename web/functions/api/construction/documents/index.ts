import { corsJson } from '../../../_lib/data';
import {
  loadConstructionDocuments,
  addConstructionDocument,
  newConstructionDocId,
} from '../../../_lib/construction/construction-store';
import { ingestConstructionDocument } from '../../../_lib/construction/construction-ingest';
import { storeConstructionFile } from '../../../_lib/construction/construction-doc-store';
import {
  CONSTRUCTION_INGEST_MAX_BYTES,
  CONSTRUCTION_MAX_MB,
} from '../../../_lib/construction/construction-limits';
import { decodeBase64Receipt } from '../../../_lib/gcs';
import { storageConfigured } from '../../../_lib/gcs';
import type { ConstructionDocType, ConstructionEnv } from '../../../_lib/construction/types';

const VALID_TYPES: ConstructionDocType[] = [
  'plan',
  'invoice',
  'estimate',
  'bid',
  'contract',
  'engineering',
  'other',
];

export const onRequestGet: PagesFunction<ConstructionEnv> = async ({ request, env }) => {
  const url = new URL(request.url);
  const typeFilter = url.searchParams.get('type');
  let documents = await loadConstructionDocuments(env);
  if (typeFilter) {
    if (typeFilter === 'photo') {
      documents = documents.filter((d) => d.contentType?.startsWith('image/'));
    } else if (typeFilter === 'bid') {
      documents = documents.filter((d) => d.type === 'bid' || d.type === 'estimate');
    } else {
      documents = documents.filter((d) => d.type === typeFilter);
    }
  }
  return corsJson(request, {
    documents,
    limits: { maxMb: CONSTRUCTION_MAX_MB, firebaseConfigured: storageConfigured(env) },
  });
};

export const onRequestPost: PagesFunction<ConstructionEnv> = async ({ request, env }) => {
  try {
    return await handleConstructionDocumentPost(request, env);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Upload failed';
    return corsJson(request, { error: message }, 500);
  }
};

async function handleConstructionDocumentPost(
  request: Request,
  env: ConstructionEnv,
): Promise<Response> {
  const apiKey = env.GEMINI_API_KEY?.trim();

  const body = (await request.json()) as {
    fileBase64?: string;
    mimeType?: string;
    fileName?: string;
    type?: string;
  };

  if (!body.fileBase64 || !body.mimeType) {
    return corsJson(request, { error: 'fileBase64 and mimeType required' }, 400);
  }

  let fileBytes: Uint8Array;
  try {
    fileBytes = decodeBase64Receipt(body.fileBase64);
  } catch {
    return corsJson(request, { error: 'Invalid file data' }, 400);
  }

  const docId = newConstructionDocId();
  const stored = await storeConstructionFile(env, docId, body.fileBase64, body.mimeType);
  const fileName = body.fileName ?? 'document';
  const uploadedAt = new Date().toISOString();

  const baseDoc = {
    id: docId,
    storagePath: stored.storagePath || null,
    contentType: stored.contentType,
    uploadedAt,
    sourceFileName: fileName,
  };

  if (!stored.storagePath) {
    return corsJson(
      request,
      {
        error:
          stored.warning ??
          'Could not save file. Large plans need FIREBASE_SERVICE_ACCOUNT_JSON in Cloudflare Pages, or must be under 15 MB.',
        code: 'storage_failed',
      },
      422,
    );
  }

  if (!apiKey) {
    const doc = await addConstructionDocument(env, {
      ...baseDoc,
      type: (body.type as ConstructionDocType) ?? 'other',
      title: fileName,
      extractedSummary:
        'File saved. GEMINI_API_KEY not configured — analysis unavailable. Open the file or configure API key.',
      extractedFields: {},
    });
    return corsJson(request, { ...doc, ingestWarning: stored.warning }, 201);
  }

  if (fileBytes.length > CONSTRUCTION_INGEST_MAX_BYTES) {
    const doc = await addConstructionDocument(env, {
      ...baseDoc,
      type: (body.type as ConstructionDocType) ?? 'plan',
      title: fileName.replace(/\.[^.]+$/, '') || fileName,
      extractedSummary:
        'Large file saved. Automatic analysis was skipped to avoid timeouts — open the file or ask the Construction Manager in Build chat to review it.',
      extractedFields: { openIssues: ['Run chat review for full summary'] },
    });
    return corsJson(request, { ...doc, ingestWarning: stored.warning }, 201);
  }

  let ingest;
  try {
    ingest = await ingestConstructionDocument(apiKey, body.fileBase64, body.mimeType, fileName);
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : 'Ingest failed';
    const doc = await addConstructionDocument(env, {
      ...baseDoc,
      type: (body.type as ConstructionDocType) ?? 'other',
      title: fileName,
      extractedSummary: `File saved but automatic analysis failed: ${errMsg}. Use get_document or open the file for manual review.`,
      extractedFields: { openIssues: ['Ingest failed — summary may be incomplete'] },
    });
    return corsJson(
      request,
      {
        ...doc,
        ingestWarning: stored.warning,
        ingestError: errMsg,
      },
      201,
    );
  }

  if (body.type && ingest.type === 'other') {
    const t = body.type as ConstructionDocType;
    if (VALID_TYPES.includes(t)) ingest.type = t;
  }

  const doc = await addConstructionDocument(env, {
    ...baseDoc,
    type: ingest.type,
    title: ingest.title,
    vendor: ingest.vendor,
    amount: ingest.amount,
    documentDate: ingest.documentDate,
    trade: ingest.trade,
    stage: ingest.stage,
    extractedSummary: ingest.extractedSummary,
    extractedFields: ingest.extractedFields,
  });

  return corsJson(
    request,
    { ...doc, ingestWarning: stored.warning },
    201,
  );
}

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
