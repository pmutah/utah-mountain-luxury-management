import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { LienReleaseFields } from './types';

export type { LienReleaseFields };

export const RIVER_LIEN_PROPERTY = {
  propertyId: 'river' as const,
  jobSite:
    '6800 Fairfax Drive and 6802 Fairfax Drive, Provo, Utah 84604 (together with all improvements thereon)',
  jobSiteLines: [
    '6800 Fairfax Drive and 6802 Fairfax Drive, Provo, Utah 84604',
    '(together with all improvements thereon)',
  ],
  owners: 'Todd Wilhite or Brandon Pierce',
  propertyName: 'The River House',
};

const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function chunkToWords(n: number): string {
  if (n < 20) return ONES[n] ?? '';
  if (n < 100) {
    const rest = n % 10;
    return `${TENS[Math.floor(n / 10)]}${rest ? `-${ONES[rest]}` : ''}`;
  }
  const rest = n % 100;
  return `${ONES[Math.floor(n / 100)]} Hundred${rest ? ` ${chunkToWords(rest)}` : ''}`;
}

export function usdToWords(amount: number): string {
  const cents = Math.round(amount * 100);
  const dollars = Math.floor(cents / 100);
  const remainder = cents % 100;
  if (dollars === 0) return `Zero and ${String(remainder).padStart(2, '0')}/100 Dollars`;
  const parts: string[] = [];
  const millions = Math.floor(dollars / 1_000_000);
  const thousands = Math.floor((dollars % 1_000_000) / 1000);
  const rest = dollars % 1000;
  if (millions) parts.push(`${chunkToWords(millions)} Million`);
  if (thousands) parts.push(`${chunkToWords(thousands)} Thousand`);
  if (rest) parts.push(chunkToWords(rest));
  return `${parts.join(' ')} and ${String(remainder).padStart(2, '0')}/100 Dollars`;
}

export function formatUsd(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function wrapWords(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (!words.length) return [''];
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Utah Code Ann. § 38-1a-802 Conditional Waiver and Release Upon Final Payment.
 * Same legal text as the River House JM & LT example, with contractor fields filled.
 */
export async function buildLienReleasePdf(fields: LienReleaseFields): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.TimesRoman);
  const bold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const italic = await pdf.embedFont(StandardFonts.TimesRomanItalic);
  const ink = rgb(0.08, 0.09, 0.12);
  const muted = rgb(0.28, 0.3, 0.34);
  const rule = rgb(0.75, 0.77, 0.8);

  const page1 = pdf.addPage([612, 792]);
  const page2 = pdf.addPage([612, 792]);
  const margin = 54;
  const width = 612 - margin * 2;

  const drawWrapped = (
    page: PDFPage,
    yRef: { y: number },
    text: string,
    opts?: { size?: number; bold?: boolean; italic?: boolean; gap?: number; indent?: number },
  ) => {
    const size = opts?.size ?? 10;
    const f = opts?.bold ? bold : opts?.italic ? italic : font;
    const x = margin + (opts?.indent ?? 0);
    const max = width - (opts?.indent ?? 0);
    for (const line of wrapWords(text, f, size, max)) {
      if (yRef.y < 56) return;
      page.drawText(line, { x, y: yRef.y, size, font: f, color: ink });
      yRef.y -= size + 3;
    }
    yRef.y -= opts?.gap ?? 0;
  };

  const field = (page: PDFPage, yRef: { y: number }, label: string, value: string) => {
    page.drawText(label, { x: margin, y: yRef.y, size: 9, font: bold, color: muted });
    yRef.y -= 14;
    for (const line of wrapWords(value || '—', font, 11, width)) {
      page.drawText(line, { x: margin, y: yRef.y, size: 11, font, color: ink });
      yRef.y -= 14;
    }
    yRef.y -= 6;
  };

  const y1 = { y: 742 };
  page1.drawText('CONDITIONAL WAIVER AND RELEASE UPON FINAL PAYMENT', {
    x: margin,
    y: y1.y,
    size: 13,
    font: bold,
    color: ink,
  });
  y1.y -= 16;
  page1.drawText('(Utah Code Ann. § 38-1a-802 form — adapted; includes laborers, suppliers, and subcontractors)', {
    x: margin,
    y: y1.y,
    size: 8.5,
    font: italic,
    color: muted,
  });
  y1.y -= 10;
  page1.drawLine({
    start: { x: margin, y: y1.y },
    end: { x: margin + width, y: y1.y },
    thickness: 1,
    color: rule,
  });
  y1.y -= 22;

  field(page1, y1, 'Property / Job Site', RIVER_LIEN_PROPERTY.jobSiteLines.join(' '));
  field(page1, y1, 'Owner / Contracting Party', RIVER_LIEN_PROPERTY.owners);
  field(page1, y1, 'Claimant (Contractor)', fields.contractorName);
  if (fields.contractorAddress) field(page1, y1, 'Address', fields.contractorAddress);
  const contact = [fields.phone ? `Phone: ${fields.phone}` : '', fields.email ? `Email: ${fields.email}` : '']
    .filter(Boolean)
    .join('  |  ');
  if (contact) field(page1, y1, 'Contact', contact);

  const invoiceBits = [
    fields.invoiceNo ? `Invoice No. ${fields.invoiceNo}` : '',
    fields.invoiceDate ? `dated ${fields.invoiceDate}` : '',
  ]
    .filter(Boolean)
    .join(' ');
  field(page1, y1, 'Invoice / Reference', invoiceBits || 'Final payment for work on The River House');
  field(page1, y1, 'Description', fields.description);
  field(
    page1,
    y1,
    'Amount of Final Payment',
    `${formatUsd(fields.amountUsd)} (${usdToWords(fields.amountUsd)})`,
  );

  const body = [
    'Upon receipt by the undersigned of a final payment in the above amount, and when the check or other instrument of payment has been properly endorsed and has cleared the bank or other financial institution on which it was drawn, this document becomes effective to release any mechanic’s or materialman’s lien, stop notice, or bond right the undersigned has on the above-described job and property. This release covers the final payment for labor, services, equipment, or material furnished to the jobsite identified above through the date of this instrument, including without limitation all work described in the invoice referenced above.',
    'BROAD RELEASE OF LOWER-TIER CLAIMS. As a material inducement for payment, the undersigned represents and warrants that: (a) the undersigned has fully paid, or will promptly pay from the final payment, every laborer, employee, subcontractor, material supplier, equipment lessor, and other person or entity who furnished labor, services, equipment, or materials to or through the undersigned for this job; and (b) no such person or entity has, or will have after payment, any claim, lien, or right to claim a lien against the Property arising from work or materials furnished for this job through the undersigned. The undersigned hereby waives, releases, and discharges, for itself and to the fullest extent the undersigned can bind its laborers, suppliers, and subcontractors, any and all liens, claims, demands, and causes of action for payment for labor, services, equipment, or materials furnished to the Property through the date of this instrument. The undersigned agrees to indemnify, defend, and hold harmless the Owner, Owner’s lenders, title insurer, and their respective successors and assigns from any lien, claim, or demand asserted by any laborer, supplier, or subcontractor claiming through the undersigned for work or materials covered by this release.',
    'This Conditional Waiver and Release Upon Final Payment is made under Utah Code Ann. Title 38, Chapter 1a, and is intended to comply with Utah Code Ann. § 38-1a-802. Before any payment clears, this document is conditional and does not extinguish lien rights. After the payment clears, this document is effective as an unconditional waiver and release as to the amount paid.',
  ];
  for (const para of body) {
    drawWrapped(page1, y1, para, { size: 9.5, gap: 10 });
  }
  y1.y -= 8;
  page1.drawText('Date: ________________________', { x: margin, y: y1.y, size: 11, font, color: ink });

  const y2 = { y: 742 };
  page2.drawText('CLAIMANT', { x: margin, y: y2.y, size: 12, font: bold, color: ink });
  y2.y -= 22;
  page2.drawText(fields.contractorName, { x: margin, y: y2.y, size: 12, font: bold, color: ink });
  y2.y -= 28;
  const lines = [
    'Signature: ____________________________________________',
    'Printed Name: _________________________________________',
    'Title: ________________________________________________',
    'Company: _____________________________________________',
  ];
  for (const line of lines) {
    page2.drawText(line, { x: margin, y: y2.y, size: 11, font, color: ink });
    y2.y -= 26;
  }

  y2.y -= 24;
  page2.drawText('Utah Mountain Luxury Management  ·  The River House', {
    x: margin,
    y: y2.y,
    size: 8,
    font: italic,
    color: muted,
  });

  return pdf.save();
}

export const JM_LT_LIEN_RELEASE: LienReleaseFields = {
  contractorName: 'JM & LT Construction Services',
  contractorAddress: 'S Little Mountain Dr, Taylorsville, UT 84123',
  phone: '435-720-6914',
  email: 'jmylt.constservices@gmail.com',
  invoiceNo: '0420',
  invoiceDate: 'August 21, 2026',
  description:
    'LVP flooring installation labor (approx. 5,450 sq ft), cement leveling at bathroom doors (8 units), and delivery labor per Invoice 0420.',
  amountUsd: 8695,
};
