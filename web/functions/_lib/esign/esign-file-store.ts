import {
  RECEIPT_ALLOWED_MIME,
  decodeBase64Receipt,
  deleteReceipt,
  downloadReceipt,
  storageConfigured,
  uploadStorageObject,
  type FirebaseStorageEnv,
} from '../gcs';
import type { SettingsEnv } from '../kv';
import {
  deleteEsignFileFromKv,
  ESIGN_MAX_BYTES,
  ESIGN_MAX_MB,
  esignIdFromKvPath,
  isKvEsignPath,
  KV_ESIGN_SINGLE_MAX_BYTES,
  loadEsignFileFromKv,
  storeEsignFileInKv,
  storeEsignFileInKvChunked,
} from './esign-file-kv';

export type EsignFileEnv = SettingsEnv & FirebaseStorageEnv;

const ALLOWED = new Set([...RECEIPT_ALLOWED_MIME]);

function firebasePath(fileId: string, contentType: string): string {
  const ext =
    contentType === 'application/pdf'
      ? 'pdf'
      : contentType === 'image/png'
        ? 'png'
        : contentType === 'image/webp'
          ? 'webp'
          : 'jpg';
  return `esign/${fileId}.${ext}`;
}

async function storeInKv(
  env: EsignFileEnv,
  fileId: string,
  bytes: Uint8Array,
  storeMime: string,
): Promise<{ path: string; contentType: string }> {
  if (bytes.length > KV_ESIGN_SINGLE_MAX_BYTES) {
    return storeEsignFileInKvChunked(env, fileId, bytes, storeMime);
  }
  return storeEsignFileInKv(env, fileId, bytes, storeMime);
}

export async function storeEsignFile(
  env: EsignFileEnv,
  fileId: string,
  fileBase64: string,
  mimeType: string,
): Promise<{ storagePath: string; contentType: string; warning?: string }> {
  if (!ALLOWED.has(mimeType)) {
    return {
      storagePath: '',
      contentType: mimeType,
      warning: 'Unsupported file type (use JPEG, PNG, WebP, or PDF).',
    };
  }

  const bytes = decodeBase64Receipt(fileBase64);
  return storeEsignBytes(env, fileId, bytes, mimeType);
}

export async function storeEsignBytes(
  env: EsignFileEnv,
  fileId: string,
  bytes: Uint8Array,
  mimeType: string,
): Promise<{ storagePath: string; contentType: string; warning?: string }> {
  if (bytes.length > ESIGN_MAX_BYTES) {
    return {
      storagePath: '',
      contentType: mimeType,
      warning: `File exceeds the ${ESIGN_MAX_MB} MB maximum.`,
    };
  }

  if (storageConfigured(env)) {
    try {
      const path = firebasePath(fileId, mimeType);
      await uploadStorageObject(env, path, bytes, mimeType, ESIGN_MAX_BYTES);
      return { storagePath: path, contentType: mimeType };
    } catch {
      // fall through to KV
    }
  }

  if (env.SETTINGS) {
    try {
      const { path, contentType } = await storeInKv(env, fileId, bytes, mimeType);
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

export async function loadEsignFile(
  env: EsignFileEnv,
  storagePath: string | null,
): Promise<{ bytes: Uint8Array; contentType: string }> {
  if (!storagePath) throw new Error('No file stored');
  if (isKvEsignPath(storagePath)) {
    return loadEsignFileFromKv(env, esignIdFromKvPath(storagePath));
  }
  const { bytes, contentType } = await downloadReceipt(env, storagePath);
  return { bytes: new Uint8Array(bytes), contentType };
}

export async function deleteEsignStoredFile(
  env: EsignFileEnv,
  storagePath: string | null,
): Promise<void> {
  if (!storagePath) return;
  if (isKvEsignPath(storagePath)) {
    await deleteEsignFileFromKv(env, esignIdFromKvPath(storagePath));
    return;
  }
  await deleteReceipt(env, storagePath);
}
