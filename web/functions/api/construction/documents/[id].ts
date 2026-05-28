import { corsJson } from '../../../_lib/data';
import {
  getConstructionDocument,
  deleteConstructionDocumentRecord,
  updateConstructionDocument,
} from '../../../_lib/construction/construction-store';
import { deleteConstructionFile } from '../../../_lib/construction/construction-doc-store';
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

export const onRequestGet: PagesFunction<ConstructionEnv> = async ({ request, env, params }) => {
  const id = params.id as string;
  const doc = await getConstructionDocument(env, id);
  if (!doc) return corsJson(request, { error: 'Not found' }, 404);
  return corsJson(request, doc);
};

export const onRequestPatch: PagesFunction<ConstructionEnv> = async ({ request, env, params }) => {
  const id = params.id as string;
  const body = (await request.json()) as {
    type?: string;
    amount?: number;
    title?: string;
    vendor?: string;
  };

  const patch: Parameters<typeof updateConstructionDocument>[2] = {};
  if (body.type && VALID_TYPES.includes(body.type as ConstructionDocType)) {
    patch.type = body.type as ConstructionDocType;
  }
  if (body.amount !== undefined) patch.amount = body.amount;
  if (body.title !== undefined) patch.title = body.title;
  if (body.vendor !== undefined) patch.vendor = body.vendor;

  const updated = await updateConstructionDocument(env, id, patch);
  if (!updated) return corsJson(request, { error: 'Not found' }, 404);
  return corsJson(request, updated);
};

export const onRequestDelete: PagesFunction<ConstructionEnv> = async ({ request, env, params }) => {
  const id = params.id as string;
  const doc = await deleteConstructionDocumentRecord(env, id);
  if (!doc) return corsJson(request, { error: 'Not found' }, 404);
  if (doc.storagePath) await deleteConstructionFile(env, doc.storagePath).catch(() => {});
  return corsJson(request, { ok: true });
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
