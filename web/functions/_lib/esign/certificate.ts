import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

export type CertificateSigner = {
  role: string;
  name: string;
  email?: string;
  completedAt?: string;
};

export type CertificateInput = {
  sessionId: string;
  documentTitle: string;
  folderLabel?: string;
  propertyLabel?: string;
  signers: CertificateSigner[];
  completedAt?: string;
  signerIp?: string;
};

function textOrDash(value?: string | null): string {
  const s = String(value ?? '').trim();
  return s || '—';
}

function formatWhen(iso?: string | null): string {
  const raw = String(iso ?? '').trim();
  if (!raw) return '—';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleString('en-US', {
    timeZone: 'America/Denver',
    dateStyle: 'long',
    timeStyle: 'short',
  });
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
 * Ported from Performance Motors DMS Certificate of Completion,
 * rebranded for Utah Mountain Luxury Management.
 */
export async function buildEsignCertificatePdf(input: CertificateInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([612, 792]);
  const margin = 48;
  const width = 612 - margin * 2;
  let y = 744;
  const ink = rgb(0.07, 0.09, 0.15);
  const muted = rgb(0.35, 0.4, 0.48);

  const draw = (
    text: string,
    opts?: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; gap?: number },
  ) => {
    const size = opts?.size ?? 10;
    const f = opts?.bold ? bold : font;
    const color = opts?.color ?? ink;
    for (const line of wrapWords(text, f, size, width)) {
      if (y < 56) break;
      page.drawText(line, { x: margin, y, size, font: f, color });
      y -= size + 4;
    }
    y -= opts?.gap ?? 0;
  };

  draw('CERTIFICATE OF COMPLETION', { size: 16, bold: true, gap: 4 });
  draw('Utah Mountain Luxury Management electronic signature package', {
    size: 10,
    color: muted,
    gap: 10,
  });

  draw('This certificate confirms that the parties listed below completed electronic signatures', {
    size: 10,
  });
  draw('on the document identified here. Each signer consented to conduct this transaction', {
    size: 10,
  });
  draw('electronically. An electronic signature has the same legal effect as a wet-ink signature.', {
    size: 10,
    gap: 14,
  });

  const rows: Array<[string, string]> = [
    ['Envelope / session', textOrDash(input.sessionId)],
    ['Status', 'Completed'],
    ['Completed', formatWhen(input.completedAt)],
    ['Document', textOrDash(input.documentTitle)],
    ['Folder', textOrDash(input.folderLabel)],
    ['Property', textOrDash(input.propertyLabel)],
    ['Signer IP', textOrDash(input.signerIp)],
  ];
  for (const [label, value] of rows) {
    page.drawText(`${label}:`, { x: margin, y, size: 10, font: bold, color: ink });
    page.drawText(value, { x: margin + 130, y, size: 10, font, color: ink, maxWidth: width - 130 });
    y -= 16;
  }

  y -= 10;
  draw('Signers', { size: 12, bold: true, gap: 6 });
  if (!input.signers.length) {
    draw('No signer completion timestamps were recorded on this session.', { size: 10, gap: 8 });
  } else {
    for (const signer of input.signers) {
      draw(`${signer.role}: ${textOrDash(signer.name)}`, { size: 10, bold: true });
      draw(`Email: ${textOrDash(signer.email)}   Signed: ${formatWhen(signer.completedAt)}`, {
        size: 9,
        color: muted,
        gap: 6,
      });
    }
  }

  y -= 8;
  draw('Consent', { size: 12, bold: true, gap: 6 });
  draw(
    'The signer chose to use electronic documents, intended to sign with an electronic signature, and acknowledged that the electronic signature has the same effect as a written ink signature. An authoritative copy of this package is stored by Utah Mountain Luxury Management and is enforceable in electronic or paper form.',
    { size: 9, color: muted, gap: 16 },
  );

  draw('Utah Mountain Luxury Management  ·  Lindon, Utah', { size: 8, color: muted });
  return pdf.save();
}

export async function buildSignatureAcknowledgmentPage(input: {
  signerName: string;
  signedAt: string;
  documentTitle: string;
  signaturePng?: Uint8Array;
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([612, 792]);
  const ink = rgb(0.07, 0.09, 0.15);
  const muted = rgb(0.35, 0.4, 0.48);
  let y = 720;

  page.drawText('Electronic Signature Consent and Acknowledgment', {
    x: 48,
    y,
    size: 16,
    font: bold,
    color: ink,
  });
  y -= 28;
  page.drawText('Utah Mountain Luxury Management', { x: 48, y, size: 11, font, color: muted });
  y -= 32;

  const lines = [
    'Electronic signature technology is being utilized to help make this transaction more convenient and secure. The signer agrees and understands the following:',
    '',
    '1. You choose to use electronic documents and intend to sign them with one or more electronic signatures.',
    '2. Your electronic signature has the same effect as your written ink signature.',
    '3. An authoritative copy of all electronically signed documents shall reside in a document server held by Utah Mountain Luxury Management, assignable and enforceable in electronic form or paper form.',
    '4. You have the right to withdraw your consent to business electronically at any time during this transaction, before you finish signing.',
  ];

  const wrap = (text: string, size: number): string[] => {
    const words = text.split(' ');
    const out: string[] = [];
    let current = '';
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= 516) {
        current = next;
      } else {
        if (current) out.push(current);
        current = word;
      }
    }
    if (current) out.push(current);
    return out;
  };

  for (const line of lines) {
    if (!line) {
      y -= 10;
      continue;
    }
    for (const wrapped of wrap(line, 10)) {
      page.drawText(wrapped, { x: 48, y, size: 10, font, color: ink });
      y -= 14;
    }
    y -= 6;
  }

  y -= 20;
  page.drawText(`Document: ${input.documentTitle}`, { x: 48, y, size: 10, font: bold, color: ink });
  y -= 18;
  page.drawText(`Signer: ${input.signerName}`, { x: 48, y, size: 10, font, color: ink });
  y -= 16;
  page.drawText(`Signed: ${formatWhen(input.signedAt)}`, { x: 48, y, size: 10, font, color: ink });
  y -= 40;

  page.drawText('Signature', { x: 48, y, size: 9, font, color: muted });
  y -= 8;
  drawSignatureBox(page, 48, y - 90, 280, 90);

  if (input.signaturePng) {
    try {
      const img = await pdf.embedPng(input.signaturePng);
      const maxW = 260;
      const maxH = 70;
      const scale = Math.min(maxW / img.width, maxH / img.height);
      page.drawImage(img, {
        x: 58,
        y: y - 80,
        width: img.width * scale,
        height: img.height * scale,
      });
    } catch {
      // keep empty box if PNG is invalid
    }
  }

  return pdf.save();
}

function drawSignatureBox(page: PDFPage, x: number, y: number, w: number, h: number): void {
  page.drawRectangle({
    x,
    y,
    width: w,
    height: h,
    borderColor: rgb(0.75, 0.78, 0.82),
    borderWidth: 1,
  });
}

export async function mergePdfBuffers(buffers: Uint8Array[]): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  for (const buf of buffers) {
    const src = await PDFDocument.load(buf);
    const pages = await out.copyPages(src, src.getPageIndices());
    for (const p of pages) out.addPage(p);
  }
  return out.save();
}

export async function imageToPdf(bytes: Uint8Array, contentType: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const img =
    contentType === 'image/png' ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
  const maxW = 516;
  const maxH = 696;
  const scale = Math.min(maxW / img.width, maxH / img.height, 1);
  const w = img.width * scale;
  const h = img.height * scale;
  page.drawImage(img, { x: (612 - w) / 2, y: (792 - h) / 2, width: w, height: h });
  return pdf.save();
}

export function decodeDataUrlPng(dataUrl: string): Uint8Array | null {
  const match = dataUrl.trim().match(/^data:image\/png;base64,(.+)$/i);
  if (!match?.[1]) return null;
  const binary = atob(match[1]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
