import {
  RECEIPT_ALLOWED_MIME,
  decodeBase64Receipt,
  receiptStoragePath,
  storageConfigured,
  uploadReceipt,
  type FirebaseStorageEnv,
} from './gcs';

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

/** Store receipt file when possible; never throws — expense save can continue without the file. */
export async function storeReceiptForExpense(
  env: FirebaseStorageEnv,
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

  if (!storageConfigured(env)) {
    return {
      meta: { ...EMPTY_META },
      warning:
        'PDF not stored — add FIREBASE_SERVICE_ACCOUNT_JSON in Cloudflare Pages settings (see DEPLOY.md). Expense amount was saved.',
    };
  }

  try {
    const bytes = decodeBase64Receipt(receiptBase64);
    const path = receiptStoragePath(propertyId, expenseId, receiptMimeType);
    await uploadReceipt(env, path, bytes, receiptMimeType);
    return {
      meta: {
        receiptStoragePath: path,
        receiptContentType: receiptMimeType,
        receiptUploadedAt: new Date().toISOString(),
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Upload failed';
    return {
      meta: { ...EMPTY_META },
      warning: `PDF not stored (${msg}). Expense amount was saved.`,
    };
  }
}

export function appendReceiptWarning(note: string | undefined, warning?: string): string | undefined {
  if (!warning) return note?.trim() || undefined;
  const base = note?.trim() || '';
  return base ? `${base} · ${warning}` : warning;
}
