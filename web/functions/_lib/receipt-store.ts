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

export async function storeReceiptForExpense(
  env: FirebaseStorageEnv,
  propertyId: string,
  expenseId: string,
  receiptBase64?: string,
  receiptMimeType?: string,
): Promise<StoredReceiptMeta> {
  if (!receiptBase64 || !receiptMimeType) {
    return {
      receiptStoragePath: null,
      receiptContentType: null,
      receiptUploadedAt: null,
    };
  }

  if (!RECEIPT_ALLOWED_MIME.has(receiptMimeType)) {
    throw new Error('Receipt must be JPEG, PNG, WebP, or PDF');
  }
  if (!storageConfigured(env)) {
    throw new Error(
      'Bill storage not configured (set FIREBASE_SERVICE_ACCOUNT_JSON on Cloudflare Pages)',
    );
  }

  const bytes = decodeBase64Receipt(receiptBase64);
  const path = receiptStoragePath(propertyId, expenseId, receiptMimeType);
  await uploadReceipt(env, path, bytes, receiptMimeType);

  return {
    receiptStoragePath: path,
    receiptContentType: receiptMimeType,
    receiptUploadedAt: new Date().toISOString(),
  };
}
