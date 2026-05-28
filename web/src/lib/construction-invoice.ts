import type { ConstructionDocument } from './api';

/** Matches server logic for "Invoiced to date" total. */
export function getDocumentInvoiceAmount(doc: ConstructionDocument): number | undefined {
  const name = (doc.sourceFileName || doc.title || '').toLowerCase();
  const invoiceLike =
    doc.type === 'invoice' ||
    (doc.type === 'other' &&
      (/\b(inv(oice)?|bill)\b|inv\s*#|invoice_/i.test(name) || /^inv\s*#/i.test(name)));

  if (!invoiceLike) return undefined;

  const amount = doc.amount;
  if (typeof amount === 'number' && Number.isFinite(amount) && amount > 0) return amount;

  const items = doc.extractedFields?.lineItems as Array<{ amount?: number }> | undefined;
  if (items?.length) {
    let sum = 0;
    let any = false;
    for (const li of items) {
      if (typeof li.amount === 'number' && li.amount > 0) {
        sum += li.amount;
        any = true;
      }
    }
    if (any) return Math.round(sum * 100) / 100;
  }

  return undefined;
}

export function sumInvoicedDocuments(documents: ConstructionDocument[]): number {
  return documents.reduce((s, d) => s + (getDocumentInvoiceAmount(d) ?? 0), 0);
}

export function needsInvoiceAttention(doc: ConstructionDocument): boolean {
  if (doc.type === 'invoice' && doc.amount != null) return false;
  const name = doc.sourceFileName || doc.title || '';
  const looksInvoice = /\b(inv(oice)?|bill)\b|inv\s*#|invoice_/i.test(name);
  if (!looksInvoice) return false;
  return getDocumentInvoiceAmount(doc) == null;
}
