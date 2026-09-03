import { generateGeminiJson, type GeminiPart } from '../gemini-call';
import { emptyFormValues, getFormTemplate } from './form-library';
import type { FormTemplate, PropertyScope } from './types';

export type ParsedInvoiceFields = {
  contractorName?: string;
  contractorAddress?: string;
  phone?: string;
  email?: string;
  invoiceNo?: string;
  invoiceDate?: string;
  amountUsd?: number;
  description?: string;
  paymentPeriod?: string;
  customer?: string;
  propertyId?: PropertyScope | null;
  confidence?: 'high' | 'low';
};

const PROMPT = `You extract contractor invoice data for a Utah construction / property lien waiver.

The claimant is the CONTRACTOR or vendor who sent the invoice — never Utah Mountain Luxury, Brandon Pierce, Todd Wilhite, or the property owners (they are the customer / owner).

Job sites you may see:
- River House / Fairfax Drive / 6800 or 6802 Fairfax / Vivian Park / Provo Canyon → river
- Ranch House / 270 East Center Street / Lindon Center → ranch
- Lindon House / 143 Harcliff Circle → lindon
- River House construction / build → construction

Return ONLY valid JSON:
{
  "contractorName": "company or person on the invoice letterhead",
  "contractorAddress": "street, city, state zip if shown",
  "phone": "contractor phone",
  "email": "contractor email (not the owner's)",
  "invoiceNo": "invoice / pay app / reference number",
  "invoiceDate": "human date as written or Month D, YYYY",
  "amountUsd": number,
  "description": "1-2 sentence professional work description for a lien waiver (what was done, where)",
  "paymentPeriod": "month or date range this invoice covers, e.g. September 1–30, 2026",
  "customer": "who was billed (often Utah Mountain Luxury Management)",
  "propertyId": "river"|"ranch"|"lindon"|"construction"|null,
  "confidence": "high"|"low"
}

Rules:
- amountUsd is the invoice TOTAL / amount due / final payment, not a line item, tax-only, or deposit unless that is the only figure
- Phrase description as completed work suitable for a waiver (e.g. "Hardware install and door closer work at 6800 / 6802 Fairfax Drive.")
- If this is an email, use the sender/signature as the contractor when letterhead is missing
- Omit a field (empty string / null) when it is not on the document — do not invent a phone, email, or invoice number
- paymentPeriod: use stated period; otherwise the calendar month of the invoice date
- customer: billed-to name if shown; otherwise "Utah Mountain Luxury Management"`;

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function cleanAmount(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.round(value * 100) / 100;
  if (typeof value === 'string') {
    const n = Number(value.replace(/[$,]/g, '').trim());
    if (Number.isFinite(n) && n > 0) return Math.round(n * 100) / 100;
  }
  return undefined;
}

function cleanProperty(value: unknown): PropertyScope | null {
  const id = cleanText(value).toLowerCase();
  if (id === 'ranch' || id === 'lindon' || id === 'river' || id === 'construction') return id;
  return null;
}

function monthPeriodFromDate(dateText: string): string {
  const parsed = Date.parse(dateText);
  if (!Number.isFinite(parsed)) return '';
  const d = new Date(parsed);
  const month = d.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
  const year = d.getUTCFullYear();
  const last = new Date(Date.UTC(year, d.getUTCMonth() + 1, 0)).getUTCDate();
  return `${month} 1–${last}, ${year}`;
}

export function normalizeParsedInvoice(raw: Partial<ParsedInvoiceFields>): ParsedInvoiceFields {
  const invoiceDate = cleanText(raw.invoiceDate);
  const paymentPeriod = cleanText(raw.paymentPeriod) || monthPeriodFromDate(invoiceDate);
  const customer = cleanText(raw.customer) || 'Utah Mountain Luxury Management';
  return {
    contractorName: cleanText(raw.contractorName) || undefined,
    contractorAddress: cleanText(raw.contractorAddress) || undefined,
    phone: cleanText(raw.phone) || undefined,
    email: cleanText(raw.email) || undefined,
    invoiceNo: cleanText(raw.invoiceNo) || undefined,
    invoiceDate: invoiceDate || undefined,
    amountUsd: cleanAmount(raw.amountUsd),
    description: cleanText(raw.description) || undefined,
    paymentPeriod: paymentPeriod || undefined,
    customer,
    propertyId: cleanProperty(raw.propertyId),
    confidence: raw.confidence === 'high' ? 'high' : 'low',
  };
}

export function applyParsedInvoice(
  template: FormTemplate,
  parsed: ParsedInvoiceFields,
): { values: Record<string, string | number>; missing: string[] } {
  const values = emptyFormValues(template);
  const allowed = new Set(template.fields.map((field) => field.key));
  const put = (key: string, value: string | number | undefined) => {
    if (value == null || value === '') return;
    if (allowed.has(key)) values[key] = value;
  };

  put('contractorName', parsed.contractorName);
  put('contractorAddress', parsed.contractorAddress);
  put('phone', parsed.phone);
  put('email', parsed.email);
  put('invoiceNo', parsed.invoiceNo);
  put('invoiceDate', parsed.invoiceDate);
  put('amountUsd', parsed.amountUsd);
  put('paymentPeriod', parsed.paymentPeriod);
  put('customer', parsed.customer);
  if (allowed.has('description')) put('description', parsed.description);
  else if (allowed.has('scope')) put('scope', parsed.description);

  if (template.lockProperty) {
    values.propertyId = template.defaultPropertyId;
  } else if (parsed.propertyId && allowed.has('propertyId')) {
    values.propertyId = parsed.propertyId;
  }

  const missing = template.fields
    .filter((field) => {
      if (!field.required) return false;
      const value = values[field.key];
      if (field.type === 'number') return !Number.isFinite(Number(value)) || Number(value) === 0;
      return !String(value ?? '').trim();
    })
    .map((field) => field.label);

  return { values, missing };
}

function parseModelJson(raw: string): ParsedInvoiceFields {
  const json = JSON.parse(raw) as Partial<ParsedInvoiceFields>;
  const parsed = normalizeParsedInvoice(json);
  if (!parsed.contractorName && parsed.amountUsd == null && !parsed.invoiceNo && !parsed.description) {
    throw new Error('Could not read contractor or invoice details from that file.');
  }
  return parsed;
}

export async function parseInvoiceFromText(
  apiKey: string,
  text: string,
  extraNote = '',
): Promise<ParsedInvoiceFields> {
  const raw = await generateGeminiJson(apiKey, [
    { text: `${PROMPT}\n\n${extraNote}\n\nInvoice or email text:\n${text.slice(0, 24_000)}` },
  ]);
  return parseModelJson(raw);
}

export async function parseInvoiceFromImage(
  apiKey: string,
  base64: string,
  mimeType: string,
  extraNote = '',
): Promise<ParsedInvoiceFields> {
  const allowed = mimeType === 'application/pdf' || mimeType.startsWith('image/');
  if (!allowed) throw new Error('Use a PDF, photo, or email of the invoice.');
  const parts: GeminiPart[] = [
    { text: `${PROMPT}\n\n${extraNote}\n\nExtract contractor invoice fields from this document.` },
    { inline_data: { mime_type: mimeType, data: base64 } },
  ];
  const raw = await generateGeminiJson(apiKey, parts);
  return parseModelJson(raw);
}

export async function parseInvoiceFromParts(
  apiKey: string,
  opts: {
    text?: string;
    imageBase64?: string;
    mimeType?: string;
    extraNote?: string;
  },
): Promise<ParsedInvoiceFields> {
  const note = opts.extraNote ?? '';
  if (opts.imageBase64 && opts.mimeType) {
    if (opts.text?.trim()) {
      const parts: GeminiPart[] = [
        {
          text: `${PROMPT}\n\n${note}\n\nEmail or notes:\n${opts.text.trim().slice(0, 12_000)}\n\nAlso read the attached invoice.`,
        },
        { inline_data: { mime_type: opts.mimeType, data: opts.imageBase64 } },
      ];
      return parseModelJson(await generateGeminiJson(apiKey, parts));
    }
    return parseInvoiceFromImage(apiKey, opts.imageBase64, opts.mimeType, note);
  }
  if (!opts.text?.trim()) throw new Error('Paste an email or attach an invoice PDF / photo.');
  return parseInvoiceFromText(apiKey, opts.text.trim(), note);
}

export function resolveParseTemplate(templateId?: string): FormTemplate {
  const template = getFormTemplate(templateId || 'river-final-release') ?? getFormTemplate('river-final-release');
  if (!template) throw new Error('Unknown form.');
  return template;
}
