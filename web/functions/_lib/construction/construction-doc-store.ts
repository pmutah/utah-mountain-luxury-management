import {
  RECEIPT_ALLOWED_MIME,
  decodeBase64Receipt,
  deleteReceipt,
  downloadReceipt,
  storageConfigured,
  uploadStorageObject,
} from '../gcs';
import {
  CONSTRUCTION_MAX_BYTES,
  CONSTRUCTION_MAX_MB,
  KV_CONSTRUCTION_SINGLE_MAX_BYTES,
} from './construction-limits';
import type { FirebaseStorageEnv } from '../gcs';
import type { SettingsEnv } from '../kv';
import {
  deleteConstructionFileFromKv,
  docIdFromKvPath,
  isKvConstructionPath,
  loadConstructionFileFromKv,
  storeConstructionFileInKv,
  storeConstructionFileInKvChunked,
} from './construction-doc-kv';

export type ConstructionDocStoreEnv = SettingsEnv & FirebaseStorageEnv;

function constructionFirebasePath(docId: string, contentType: string): string {
  const ext =
    contentType === 'application/pdf'
      ? 'pdf'
      : contentType === 'image/png'
        ? 'png'
        : contentType === 'image/webp'
          ? 'webp'
          : 'jpg';
  return `construction/${docId}.${ext}`;
}

const CONSTRUCTION_ALLOWED_MIME = new Set([
  ...RECEIPT_ALLOWED_MIME,
  'image/heic',
  'image/heif',
]);

async function storeInKv(
  env: ConstructionDocStoreEnv,
  docId: string,
  bytes: Uint8Array,
  storeMime: string,
): Promise<{ path: string; contentType: string }> {
  if (bytes.length > KV_CONSTRUCTION_SINGLE_MAX_BYTES) {
    return storeConstructionFileInKvChunked(env, docId, bytes, storeMime);
  }
  return storeConstructionFileInKv(env, docId, bytes, storeMime);
}

export async function storeConstructionFile(
  env: ConstructionDocStoreEnv,
  docId: string,
  fileBase64: string,
  mimeType: string,
): Promise<{ storagePath: string; contentType: string; warning?: string }> {
  const normalizedMime =
    mimeType === 'image/heic' || mimeType === 'image/heif' ? 'image/jpeg' : mimeType;
  if (!CONSTRUCTION_ALLOWED_MIME.has(mimeType) && !CONSTRUCTION_ALLOWED_MIME.has(normalizedMime)) {
    return {
      storagePath: '',
      contentType: mimeType,
      warning: 'Unsupported file type (use JPEG, PNG, WebP, or PDF).',
    };
  }

  const bytes = decodeBase64Receipt(fileBase64);
  const storeMime = normalizedMime;

  if (bytes.length > CONSTRUCTION_MAX_BYTES) {
    return {
      storagePath: '',
      contentType: mimeType,
      warning: `File exceeds the ${CONSTRUCTION_MAX_MB} MB maximum.`,
    };
  }

  if (storageConfigured(env)) {
    try {
      const path = constructionFirebasePath(docId, storeMime);
      await uploadStorageObject(env, path, bytes, storeMime, CONSTRUCTION_MAX_BYTES);
      return { storagePath: path, contentType: storeMime };
    } catch {
      // fall through to KV (chunked when needed)
    }
  }

  if (env.SETTINGS) {
    try {
      const { path, contentType } = await storeInKv(env, docId, bytes, storeMime);
      const warning = storageConfigured(env)
        ? undefined
        : bytes.length > KV_CONSTRUCTION_SINGLE_MAX_BYTES
          ? 'Stored in Cloudflare KV (split across chunks). For best performance on large plans, add FIREBASE_SERVICE_ACCOUNT_JSON (see DEPLOY.md).'
          : undefined;
      return { storagePath: path, contentType, warning };
    } catch (e) {
      return {
        storagePath: '',
        contentType: mimeType,
        warning: e instanceof Error ? e.message : 'KV store failed',
      };
    }
  }

  return { storagePath: '', contentType: mimeType, warning: 'No file storage configured.' };
}

export async function loadConstructionFile(
  env: ConstructionDocStoreEnv,
  storagePath: string | null,
): Promise<{ bytes: Uint8Array; contentType: string }> {
  if (!storagePath) throw new Error('No file stored');
  if (isKvConstructionPath(storagePath)) {
    return loadConstructionFileFromKv(env, docIdFromKvPath(storagePath));
  }
  const { bytes, contentType } = await downloadReceipt(env, storagePath);
  return { bytes: new Uint8Array(bytes), contentType };
}

export async function deleteConstructionFile(
  env: ConstructionDocStoreEnv,
  storagePath: string | null,
): Promise<void> {
  if (!storagePath) return;
  if (isKvConstructionPath(storagePath)) {
    await deleteConstructionFileFromKv(env, docIdFromKvPath(storagePath));
    return;
  }
  await deleteReceipt(env, storagePath);
}
