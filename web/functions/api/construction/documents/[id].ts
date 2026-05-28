import { corsJson } from '../../../_lib/data';
import {
  getConstructionDocument,
  deleteConstructionDocumentRecord,
} from '../../../_lib/construction/construction-store';
import { deleteConstructionFile } from '../../../_lib/construction/construction-doc-store';
import type { ConstructionEnv } from '../../../_lib/construction/types';

export const onRequestGet: PagesFunction<ConstructionEnv> = async ({ request, env, params }) => {
  const id = params.id as string;
  const doc = await getConstructionDocument(env, id);
  if (!doc) return corsJson(request, { error: 'Not found' }, 404);
  return corsJson(request, doc);
};

export const onRequestDelete: PagesFunction<ConstructionEnv> = async ({ request, env, params }) => {
  const id = params.id as string;
  const doc = await deleteConstructionDocumentRecord(env, id);
  if (!doc) return corsJson(request, { error: 'Not found' }, 404);
  if (doc.storagePath) await deleteConstructionFile(env, doc.storagePath).catch(() => {});
  return corsJson(request, { ok: true });
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
