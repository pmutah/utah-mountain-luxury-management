import type { ConstructionDocType, ConstructionDocument } from './types';

const INGEST_MODEL = 'gemini-2.5-flash';

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
): Promise<IngestResult> {
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
    {
      text: `You are a construction document analyst. Extract structured data from this document for a residential build in Utah County / Lindon, Utah.

Return ONLY valid JSON:
{
  "type": "plan"|"invoice"|"estimate"|"bid"|"contract"|"engineering"|"other",
  "title": "short title",
  "vendor": "company or null",
  "amount": number or null (total contract/bid/invoice amount USD),
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

For plans: list sheet disciplines and schedules referenced. Do not invent structural member sizes not shown.
File name: ${fileName ?? 'document'}`,
    },
  ];

  if (mimeType.startsWith('image/') || mimeType === 'application/pdf') {
    parts.push({ inlineData: { mimeType, data: fileBase64 } });
  } else {
    throw new Error('Unsupported mime type for ingest');
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${INGEST_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0 },
      }),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Ingest failed: ${res.status} ${err.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const raw = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!raw) throw new Error('Empty ingest response');

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

  return {
    type,
    title: parsed.title || fileName || 'Document',
    vendor: parsed.vendor ?? undefined,
    amount: typeof parsed.amount === 'number' ? parsed.amount : undefined,
    documentDate: parsed.documentDate ?? undefined,
    trade: parsed.trade ?? undefined,
    stage: parsed.stage ?? undefined,
    extractedSummary: parsed.extractedSummary || 'No summary extracted.',
    extractedFields: parsed.extractedFields ?? {},
  };
}
