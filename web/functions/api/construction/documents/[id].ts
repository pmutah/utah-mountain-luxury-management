import { hostDenied, hostOnly } from '../../../_lib/auth';
import { corsJson } from '../../../_lib/data';
import { readOrRefuse } from '../../../_lib/read-guard';
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
  if (!hostOnly(request, env)) return hostDenied(request, env);
  const id = params.id as string;
  const read = await readOrRefuse(request, () => getConstructionDocument(env, id), 'Construction documents');
  if (!read.ok) return read.response;
  if (!read.value) return corsJson(request, { error: 'Not found' }, 404);
  return corsJson(request, read.value);
};

export const onRequestPatch: PagesFunction<ConstructionEnv> = async ({ request, env, params }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
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

  const read = await readOrRefuse(request, () => updateConstructionDocument(env, id, patch), 'Construction documents');
  if (!read.ok) return read.response;
  if (!read.value) return corsJson(request, { error: 'Not found' }, 404);
  return corsJson(request, read.value);
};

export const onRequestDelete: PagesFunction<ConstructionEnv> = async ({ request, env, params }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  const id = params.id as string;
  const read = await readOrRefuse(request, () => deleteConstructionDocumentRecord(env, id), 'Construction documents');
  if (!read.ok) return read.response;
  const doc = read.value;
  if (!doc) return corsJson(request, { error: 'Not found' }, 404);
  if (doc.storagePath) await deleteConstructionFile(env, doc.storagePath).catch(() => {});
  return corsJson(request, { ok: true });
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
