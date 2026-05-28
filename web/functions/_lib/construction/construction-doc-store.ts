import {
  RECEIPT_ALLOWED_MIME,
  decodeBase64Receipt,
  deleteReceipt,
  downloadReceipt,
  storageConfigured,
  uploadReceipt,
} from '../gcs';
import type { FirebaseStorageEnv } from '../gcs';
import type { SettingsEnv } from '../kv';
import {
  deleteConstructionFileFromKv,
  docIdFromKvPath,
  isKvConstructionPath,
  kvConstructionPath,
  KV_CONSTRUCTION_MAX_BYTES,
  loadConstructionFileFromKv,
  storeConstructionFileInKv,
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

export async function storeConstructionFile(
  env: ConstructionDocStoreEnv,
  docId: string,
  fileBase64: string,
  mimeType: string,
): Promise<{ storagePath: string; contentType: string; warning?: string }> {
  if (!RECEIPT_ALLOWED_MIME.has(mimeType)) {
    return {
      storagePath: '',
      contentType: mimeType,
      warning: 'Unsupported file type (use JPEG, PNG, WebP, or PDF).',
    };
  }

  const bytes = decodeBase64Receipt(fileBase64);

  if (storageConfigured(env)) {
    try {
      const path = constructionFirebasePath(docId, mimeType);
      await uploadReceipt(env, path, bytes, mimeType);
      return { storagePath: path, contentType: mimeType };
    } catch {
      // fall through to KV
    }
  }

  if (env.SETTINGS) {
    if (bytes.length > KV_CONSTRUCTION_MAX_BYTES) {
      return {
        storagePath: '',
        contentType: mimeType,
        warning: `File too large for KV (max ${KV_CONSTRUCTION_MAX_BYTES / (1024 * 1024)} MB). Use Firebase storage.`,
      };
    }
    try {
      const { path, contentType } = await storeConstructionFileInKv(env, docId, bytes, mimeType);
      return { storagePath: path, contentType };
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
