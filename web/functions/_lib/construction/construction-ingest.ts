import { generateGeminiJson, type GeminiPart } from '../gemini-call';
import type { ConstructionDocType, ConstructionDocument } from './types';
import { normalizeIngestFields } from './construction-invoice';

export type IngestResult = {
  type: ConstructionDocType;
  title: string;
  vendor?: string;
  amount?: number;
  documentDate?: string;
  trade?: string;
  stage?: string;
  extractedSummary: string;
  extractedFields: ConstructionDocument['extractedFields'];
};

export async function ingestConstructionDocument(
  apiKey: string,
  fileBase64: string,
  mimeType: string,
  fileName?: string,
  userTypeHint?: ConstructionDocType,
): Promise<IngestResult> {
  const prompt = `You are a construction document analyst. Extract structured data from this document for a residential build in Utah County / Lindon, Utah.

Return ONLY valid JSON:
{
  "type": "plan"|"invoice"|"estimate"|"bid"|"contract"|"engineering"|"other",
  "title": "short title",
  "vendor": "company or null",
  "amount": number or null (total due / invoice total / contract total in USD — use the FINAL balance or total, not individual line items unless no total is shown),
  "documentDate": "YYYY-MM-DD or null",
  "trade": "primary trade or null",
  "stage": "construction stage hint or null",
  "extractedSummary": "2-4 paragraphs: scope, key numbers, risks, coordination notes",
  "extractedFields": {
    "disciplines": ["A","S","M","E","P"] as applicable for plans,
    "trades": ["framing","electrical",...],
    "codeRefs": ["IRC R310",...] if mentioned,
    "openIssues": ["questions or conflicts"],
    "lineItems": [{"description":"...","amount":123}],
    "exclusions": ["..."],
    "alternates": ["..."]
  }
}

IMPORTANT:
- If this is a vendor INVOICE or BILL requesting payment (including "Inv #", "Invoice", amounts due), set type to "invoice" and amount to the invoice TOTAL / balance due.
- Quotes, estimates, and bids are NOT invoices — use estimate or bid unless it is clearly a bill for work already performed.
- For plans: list sheet disciplines and schedules referenced. Do not invent structural member sizes not shown.

File name: ${fileName ?? 'document'}`;

  if (!mimeType.startsWith('image/') && mimeType !== 'application/pdf') {
    throw new Error('Unsupported mime type for ingest');
  }

  const parts: GeminiPart[] = [
    { text: prompt },
    { inline_data: { mime_type: mimeType, data: fileBase64 } },
  ];

  const raw = await generateGeminiJson(apiKey, parts);
  const parsed = JSON.parse(raw) as IngestResult & { type: string };
  const validTypes: ConstructionDocType[] = [
    'plan',
    'invoice',
    'estimate',
    'bid',
    'contract',
    'engineering',
    'other',
  ];
  const type = validTypes.includes(parsed.type as ConstructionDocType)
    ? (parsed.type as ConstructionDocType)
    : 'other';

  const normalized = normalizeIngestFields({
    type,
    title: parsed.title || fileName || 'Document',
    amount: parsed.amount,
    vendor: parsed.vendor ?? undefined,
    sourceFileName: fileName,
    extractedFields: parsed.extractedFields ?? {},
    userTypeHint,
  });

  return {
    type: normalized.type,
    title: normalized.title,
    vendor: normalized.vendor,
    amount: normalized.amount,
    documentDate: parsed.documentDate ?? undefined,
    trade: parsed.trade ?? undefined,
    stage: parsed.stage ?? undefined,
    extractedSummary: parsed.extractedSummary || 'No summary extracted.',
    extractedFields: normalized.extractedFields,
  };
}
