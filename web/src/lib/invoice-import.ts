export type LocalInvoiceFields = {
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
  propertyId?: 'ranch' | 'lindon' | 'river' | 'construction';
};

const UML_NAMES = /utah mountain luxury|brandon pierce|todd wilhite|stephanie pierce/i;

function firstMatch(text: string, patterns: RegExp[]): string {
  for (const pattern of patterns) {
    const m = text.match(pattern);
    const value = (m?.[1] ?? '').replace(/\s+/g, ' ').trim();
    if (value) return value.replace(/^[:#\-\s]+/, '').replace(/[.,;]+$/, '');
  }
  return '';
}

function parseAmount(text: string): number | undefined {
  const labeled = text.match(
    /(?:amount\s*due|balance\s*due|total\s*due|invoice\s*total|grand\s*total|total|amount)[:\s]*\$?\s*([\d,]+(?:\.\d{2})?)/i,
  );
  if (labeled) {
    const n = Number(labeled[1]!.replace(/,/g, ''));
    if (Number.isFinite(n) && n > 0) return n;
  }
  const dollars = [...text.matchAll(/\$\s*([\d,]+(?:\.\d{2})?)/g)]
    .map((m) => Number(m[1]!.replace(/,/g, '')))
    .filter((n) => Number.isFinite(n) && n >= 10);
  if (!dollars.length) return undefined;
  return Math.max(...dollars);
}

function guessProperty(text: string): LocalInvoiceFields['propertyId'] {
  if (/6800|6802|fairfax|vivian park|provo canyon|river house/i.test(text)) return 'river';
  if (/harcliff|lindon house/i.test(text)) return 'lindon';
  if (/270\s*east\s*center|ranch house/i.test(text)) return 'ranch';
  return undefined;
}

function guessPeriod(dateText: string): string | undefined {
  const parsed = Date.parse(dateText);
  if (!Number.isFinite(parsed)) return undefined;
  const d = new Date(parsed);
  const month = d.toLocaleString('en-US', { month: 'long' });
  const year = d.getFullYear();
  const last = new Date(year, d.getMonth() + 1, 0).getDate();
  return `${month} 1–${last}, ${year}`;
}

function fromLineName(text: string): string {
  const from = firstMatch(text, [/^from:\s*(.+)$/im]);
  if (!from || UML_NAMES.test(from)) return '';
  const withoutEmail = from.replace(/<[^>]+>/, '').replace(/\s+/g, ' ').trim();
  return withoutEmail.split(',')[0]?.trim() ?? '';
}

export function looksLikeInvoiceText(text: string): boolean {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length < 40) return false;
  return /invoice|pay\s*app|amount\s*due|balance\s*due|remit|contractor|lien|waiver|inv\s*#|from:|subject:/i.test(
    t,
  );
}

export function parseInvoiceTextLocal(raw: string): LocalInvoiceFields | null {
  const text = raw.replace(/\u00a0/g, ' ').trim();
  if (!text) return null;

  const email = firstMatch(text, [
    /(?<![\w.-])(?!utahmountainluxury|pmutah)([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i,
  ]);
  const fromEmail = firstMatch(text, [/^from:.*<([^>]+)>/im, /^from:\s*(\S+@\S+)/im]);
  const contractorEmail = fromEmail && !UML_NAMES.test(fromEmail) ? fromEmail : email;

  const phone = firstMatch(text, [
    /(?:phone|tel|mobile|cell)[:\s]*((?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4})/i,
    /\b(\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4})\b/,
  ]);

  const invoiceNo = firstMatch(text, [
    /(?:invoice|inv|pay\s*app(?:lication)?)\s*(?:no\.?|number|#)\s*[:#]?\s*([A-Z0-9][A-Z0-9\-\/]{1,20})/i,
    /\binvoice\s+([A-Z0-9][A-Z0-9\-\/]{1,20})\b/i,
  ]);

  const invoiceDate = firstMatch(text, [
    /(?:invoice\s*date|date)[:\s]+([A-Za-z]{3,9}\.?\s+\d{1,2},?\s+\d{4})/i,
    /(?:invoice\s*date|date)[:\s]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/,
  ]);

  const subject = firstMatch(text, [/^subject:\s*(.+)$/im]);
  const contractorName =
    fromLineName(text) ||
    firstMatch(text, [
      /(?:contractor|company|from|vendor)[:\s]+([A-Za-z0-9&.'\-\s]{3,60})/i,
    ]);

  const addressRaw = firstMatch(text, [
    /(?:address|office)[:\s]+(\d{1,6}\s+[A-Za-z0-9.'\- ]+(?:street|st|drive|dr|road|rd|lane|ln|ave|avenue|blvd|way|circle|cir)[^\n]{0,50})/i,
  ]);
  const address =
    addressRaw && !/fairfax|harcliff|east center|vivian park/i.test(addressRaw) ? addressRaw : '';

  const amountUsd = parseAmount(text);
  const propertyId = guessProperty(text);
  const site =
    propertyId === 'river'
      ? 'the River House (6800 / 6802 Fairfax Drive)'
      : propertyId === 'ranch'
        ? 'the Ranch House'
        : propertyId === 'lindon'
          ? 'the Lindon House'
          : 'the job site';

  const workHint = firstMatch(text, [
    /(?:description of work|scope of work|work performed)[:\s]+(.{12,160})/i,
    /(?:description|scope)[:\s]+(.{12,160})/i,
  ]);
  const work = (workHint || subject || '').replace(/^invoice\s+/i, '').trim();

  const description = work
    ? (/fairfax|river house|ranch house|lindon house|harcliff|job site/i.test(work)
        ? work
        : `${work} at ${site}`
      )
        .replace(/\s+/g, ' ')
        .replace(/[.]+$/, '')
        .concat('.')
    : invoiceNo
      ? `Work billed on invoice ${invoiceNo} at ${site}.`
      : amountUsd
        ? `Contract work at ${site}.`
        : undefined;

  const fields: LocalInvoiceFields = {
    contractorName: contractorName && !UML_NAMES.test(contractorName) ? contractorName : undefined,
    contractorAddress: address || undefined,
    phone: phone || undefined,
    email: contractorEmail && !UML_NAMES.test(contractorEmail) ? contractorEmail : undefined,
    invoiceNo: invoiceNo || undefined,
    invoiceDate: invoiceDate || undefined,
    amountUsd,
    description,
    paymentPeriod: invoiceDate ? guessPeriod(invoiceDate) : undefined,
    customer: 'Utah Mountain Luxury Management',
    propertyId,
  };

  if (!fields.contractorName && !fields.amountUsd && !fields.invoiceNo && !fields.description) {
    return null;
  }
  return fields;
}
