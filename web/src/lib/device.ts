/** True for phones/tablets where PDF iframes and blob URLs are unreliable. */
export function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent,
  );
}

export function isPdfContentType(contentType?: string | null): boolean {
  return contentType === 'application/pdf';
}

export function expenseReceiptIsPdf(expense: {
  receiptContentType?: string | null;
  receiptStoragePath?: string | null;
}): boolean {
  if (isPdfContentType(expense.receiptContentType)) return true;
  const path = expense.receiptStoragePath ?? '';
  return path.endsWith('.pdf') || path.includes('.pdf');
}
