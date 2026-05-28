import { corsJson } from '../../../../_lib/data';
import { uint8ToBase64 } from '../../../../_lib/construction/construction-binary';
import { ingestConstructionDocument } from '../../../../_lib/construction/construction-ingest';
import { loadConstructionFile } from '../../../../_lib/construction/construction-doc-store';
import { CONSTRUCTION_INGEST_MAX_BYTES } from '../../../../_lib/construction/construction-limits';
import {
  getConstructionDocument,
  updateConstructionDocument,
} from '../../../../_lib/construction/construction-store';
import type { ConstructionEnv } from '../../../../_lib/construction/types';

export const onRequestPost: PagesFunction<ConstructionEnv> = async ({ request, env, params }) => {
  const apiKey = env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return corsJson(request, { error: 'GEMINI_API_KEY not configured' }, 503);
  }

  const id = params.id as string;
  const doc = await getConstructionDocument(env, id);
  if (!doc) return corsJson(request, { error: 'Not found' }, 404);
  if (!doc.storagePath) {
    return corsJson(request, { error: 'No file stored for this document' }, 400);
  }

  try {
    const { bytes, contentType } = await loadConstructionFile(env, doc.storagePath);
    if (bytes.length > CONSTRUCTION_INGEST_MAX_BYTES) {
      return corsJson(
        request,
        {
          error:
            'File is too large for automatic analysis. Set Type to Invoice and enter the total manually.',
        },
        400,
      );
    }

    const fileBase64 = uint8ToBase64(bytes);
    const ingest = await ingestConstructionDocument(
      apiKey,
      fileBase64,
      contentType,
      doc.sourceFileName ?? doc.title,
      doc.type === 'other' ? undefined : doc.type,
    );

    const updated = await updateConstructionDocument(env, id, {
      type: ingest.type,
      title: ingest.title,
      vendor: ingest.vendor,
      amount: ingest.amount,
      extractedSummary: ingest.extractedSummary,
      extractedFields: ingest.extractedFields,
    });

    if (!updated) return corsJson(request, { error: 'Not found' }, 404);

    return corsJson(request, updated);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Re-analyze failed';
    return corsJson(request, { error: message }, 502);
  }
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
