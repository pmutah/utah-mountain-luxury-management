export const RECEIPT_MAX_BYTES = 10 * 1024 * 1024;

export const RECEIPT_ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export function receiptExtension(contentType: string): string {
  switch (contentType) {
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    default:
      return 'jpg';
  }
}

export function receiptStoragePath(
  propertyId: string,
  expenseId: string,
  contentType: string,
): string {
  return `receipts/${propertyId}/${expenseId}.${receiptExtension(contentType)}`;
}
