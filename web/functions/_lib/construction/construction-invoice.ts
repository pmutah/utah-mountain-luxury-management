import type { ConstructionDocType, ConstructionDocument } from './types';

const INVOICE_FILE_RE =
  /\b(inv(oice)?|bill)\b|inv\s*#|invoice[_\s-]|inv[_\s-]\d|from_.*construction/i;
const QUOTE_ONLY_RE = /\b(quote|estimate|proposal)\b/i;

export function looksLikeInvoiceFileName(name: string): boolean {
  const n = name.toLowerCase();
  if (!INVOICE_FILE_RE.test(n)) return false;
  if (QUOTE_ONLY_RE.test(n) && !/\binv(oice)?\b|inv\s*#/i.test(n)) return false;
  return true;
}

export function parseMoneyAmount(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[$,\s]/g, '');
    const n = parseFloat(cleaned);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return undefined;
}

export function sumLineItemsAmount(
  lineItems?: Array<{ description?: string; amount?: unknown }>,
): number | undefined {
  if (!lineItems?.length) return undefined;
  let sum = 0;
  let any = false;
  for (const li of lineItems) {
    const a = parseMoneyAmount(li.amount);
    if (a != null) {
      sum += a;
      any = true;
    }
  }
  return any ? Math.round(sum * 100) / 100 : undefined;
}

export function extractAmountFromFileName(fileName: string): number | undefined {
  const forMatch = fileName.match(/for\s+\$?\s*([\d,]+\.?\d*)/i);
  if (forMatch) return parseMoneyAmount(forMatch[1]);
  const tailMatch = fileName.match(/\$\s*([\d,]+\.?\d*)\s*(?:\.pdf)?$/i);
  if (tailMatch) return parseMoneyAmount(tailMatch[1]);
  return undefined;
}

export function normalizeIngestFields(input: {
  type: ConstructionDocType;
  title: string;
  amount?: unknown;
  vendor?: string;
  sourceFileName?: string;
  extractedFields?: ConstructionDocument['extractedFields'];
  userTypeHint?: ConstructionDocType;
}): {
  type: ConstructionDocType;
  title: string;
  amount?: number;
  vendor?: string;
  extractedFields: ConstructionDocument['extractedFields'];
} {
  const fileName = input.sourceFileName || input.title || '';
  const fields = input.extractedFields ?? {};
  let type = input.type;
  let amount =
    parseMoneyAmount(input.amount) ??
    sumLineItemsAmount(fields.lineItems) ??
    extractAmountFromFileName(fileName);

  if (input.userTypeHint && input.userTypeHint !== 'other') {
    type = input.userTypeHint;
  } else if (looksLikeInvoiceFileName(fileName)) {
    type = 'invoice';
  }

  if (type === 'invoice' && amount == null) {
    amount = sumLineItemsAmount(fields.lineItems);
  }

  return {
    type,
    title: input.title,
    amount,
    vendor: input.vendor,
    extractedFields: fields,
  };
}

/** Amount that counts toward "Invoiced to date" for this document. */
export function getDocumentInvoiceAmount(doc: ConstructionDocument): number | undefined {
  const isInvoiceType = doc.type === 'invoice';
  const invoiceLike =
    isInvoiceType ||
    (doc.type === 'other' && looksLikeInvoiceFileName(doc.sourceFileName || doc.title));

  if (!invoiceLike) return undefined;

  return (
    parseMoneyAmount(doc.amount) ??
    sumLineItemsAmount(doc.extractedFields?.lineItems) ??
    extractAmountFromFileName(doc.sourceFileName || doc.title || '')
  );
}

export function ingestFailedSummary(summary: string | undefined): boolean {
  if (!summary) return false;
  return /automatic analysis failed|ingest failed/i.test(summary);
}

export function sumInvoicedAmount(docs: ConstructionDocument[]): number {
  return docs.reduce((s, d) => s + (getDocumentInvoiceAmount(d) ?? 0), 0);
}
