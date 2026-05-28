import { corsJson } from '../../../_lib/data';
import {
  loadConstructionDocuments,
  addConstructionDocument,
  newConstructionDocId,
} from '../../../_lib/construction/construction-store';
import { ingestConstructionDocument } from '../../../_lib/construction/construction-ingest';
import { storeConstructionFile } from '../../../_lib/construction/construction-doc-store';
import { CONSTRUCTION_MAX_MB } from '../../../_lib/construction/construction-limits';
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
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
