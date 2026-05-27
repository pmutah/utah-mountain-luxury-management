import {
  RECEIPT_ALLOWED_MIME,
  decodeBase64Receipt,
  deleteReceipt,
  downloadReceipt,
  receiptStoragePath,
  storageConfigured,
  uploadReceipt,
  type FirebaseStorageEnv,
} from './gcs';
import type { SettingsEnv } from './kv';
import {
  KV_RECEIPT_MAX_BYTES,
  kvReceiptPath,
  loadReceiptFromKv,
  storeReceiptInKv,
  isKvReceiptPath,
  deleteReceiptFromKv,
  expenseIdFromKvPath,
} from './receipt-kv';

export type StoredReceiptMeta = {
  receiptStoragePath: string | null;
  receiptContentType: string | null;
  receiptUploadedAt: string | null;
};

const EMPTY_META: StoredReceiptMeta = {
  receiptStoragePath: null,
  receiptContentType: null,
  receiptUploadedAt: null,
};

export type ReceiptStoreResult = {
  meta: StoredReceiptMeta;
  /** Set when the expense was saved but the file could not be stored. */
  warning?: string;
};

export type ReceiptStoreEnv = SettingsEnv & FirebaseStorageEnv;

/** Store receipt file when possible; never throws — expense save can continue without the file. */
export async function storeReceiptForExpense(
  env: ReceiptStoreEnv,
  propertyId: string,
  expenseId: string,
  receiptBase64?: string,
  receiptMimeType?: string,
): Promise<ReceiptStoreResult> {
  if (!receiptBase64 || !receiptMimeType) {
    return { meta: { ...EMPTY_META } };
  }

  if (!RECEIPT_ALLOWED_MIME.has(receiptMimeType)) {
    return {
      meta: { ...EMPTY_META },
      warning: 'File type not supported for storage (use JPEG, PNG, WebP, or PDF). Expense was saved.',
    };
  }

  const bytes = decodeBase64Receipt(receiptBase64);
  const uploadedAt = new Date().toISOString();

  if (storageConfigured(env)) {
    try {
      const path = receiptStoragePath(propertyId, expenseId, receiptMimeType);
      await uploadReceipt(env, path, bytes, receiptMimeType);
      return {
        meta: {
          receiptStoragePath: path,
          receiptContentType: receiptMimeType,
          receiptUploadedAt: uploadedAt,
        },
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Upload failed';
      // Fall through to KV if Firebase upload fails
      if (!env.SETTINGS) {
        return {
          meta: { ...EMPTY_META },
          warning: `PDF not stored (${msg}). Expense amount was saved.`,
        };
      }
    }
  }

  if (env.SETTINGS) {
    if (bytes.length > KV_RECEIPT_MAX_BYTES) {
      return {
        meta: { ...EMPTY_META },
        warning: `PDF too large to store (max ${KV_RECEIPT_MAX_BYTES / (1024 * 1024)} MB). Expense amount was saved.`,
      };
    }
    try {
      const { path, contentType } = await storeReceiptInKv(env, expenseId, bytes, receiptMimeType);
      return {
        meta: {
          receiptStoragePath: path,
          receiptContentType: contentType,
          receiptUploadedAt: uploadedAt,
        },
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'KV save failed';
      return {
        meta: { ...EMPTY_META },
        warning: `PDF not stored (${msg}). Expense amount was saved.`,
      };
    }
  }

  return {
    meta: { ...EMPTY_META },
    warning:
      'PDF not stored — expense amount was saved. Re-import after storage is available, or contact the site admin.',
  };
}

export async function loadStoredReceipt(
  env: ReceiptStoreEnv,
  expense: { id: string; receiptStoragePath?: string | null },
): Promise<{ bytes: Uint8Array; contentType: string }> {
  const path = expense.receiptStoragePath;
  if (!path) throw new Error('No receipt for this expense');

  if (isKvReceiptPath(path)) {
    return loadReceiptFromKv(env, expenseIdFromKvPath(path));
  }

  const { bytes, contentType } = await downloadReceipt(env, path);
  return { bytes: new Uint8Array(bytes), contentType };
}

export async function deleteStoredReceipt(
  env: ReceiptStoreEnv,
  expense: { id: string; receiptStoragePath?: string | null },
): Promise<void> {
  const path = expense.receiptStoragePath;
  if (!path) return;

  if (isKvReceiptPath(path)) {
    await deleteReceiptFromKv(env, expenseIdFromKvPath(path));
    return;
  }

  await deleteReceipt(env, path);
}

export function appendReceiptWarning(note: string | undefined, warning?: string): string | undefined {
  if (!warning) return note?.trim() || undefined;
  const base = note?.trim() || '';
  return base ? `${base} · ${warning}` : warning;
}

export { isKvReceiptPath, kvReceiptPath };
