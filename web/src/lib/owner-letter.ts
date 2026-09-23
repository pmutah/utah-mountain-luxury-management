import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { PROPERTIES, formatCurrency, type PortfolioData } from './api';
import { formatMonthLabel } from './months';
import { formatWhole, morningBriefing, portfolioProfit, portfolioRevenue, propertyHealth, waterfallBands } from './luxury';

export async function downloadOwnerLetter(data: PortfolioData) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const serif = await pdf.embedFont(StandardFonts.TimesRoman);
  const bold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const ink = rgb(0.11, 0.16, 0.15);
  const gold = rgb(0.55, 0.42, 0.18);
  const muted = rgb(0.35, 0.4, 0.38);
  let y = 740;

  const write = (text: string, size: number, font = serif, color = ink) => {
    const words = text.split(' ');
    let line = '';
    const max = 460;
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > max) {
        page.drawText(line, { x: 72, y, size, font, color });
        y -= size + 6;
        line = word;
      } else {
        line = next;
      }
    }
    if (line) {
      page.drawText(line, { x: 72, y, size, font, color });
      y -= size + 8;
    }
  };

  page.drawText('UTAH MOUNTAIN LUXURY', { x: 72, y, size: 11, font: bold, color: gold });
  y -= 28;
  page.drawText('The Letter', { x: 72, y, size: 28, font: serif, color: ink });
  y -= 22;
  page.drawText(formatMonthLabel(data.month), { x: 72, y, size: 14, font: serif, color: muted });
  y -= 28;
  write(morningBriefing(data), 12);
  y -= 8;
  write(
    `Host payouts ${formatWhole(portfolioRevenue(data))}. Net after the houses' own costs ${formatWhole(portfolioProfit(data))}.`,
    12,
  );
  y -= 6;

  for (const id of ['ranch', 'lindon', 'river'] as const) {
    const health = propertyHealth(id, data[id]);
    write(
      `${PROPERTIES[id].name}: ${formatCurrency(data[id].revenue)} payout, ${data[id].occupancy.toFixed(0)}% occupied, health ${health.score}.`,
      12,
    );
  }
  y -= 6;
  write('Where it went', 14, bold);
  for (const band of waterfallBands(data).filter((b) => b.value > 0)) {
    write(`${band.label} — ${formatCurrency(band.value)}. ${band.detail}.`, 11, serif, muted);
  }
  y -= 10;
  write('Prepared for the partners. Ranch and River remain 20% management, then 50/50. Lindon is Brandon’s.', 11, serif, muted);
  y -= 16;
  write('Brandon', 14, serif);

  const bytes = await pdf.save();
  const blob = new Blob([Uint8Array.from(bytes)], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Utah-Mountain-Luxury-Letter-${data.month}.pdf`;
  link.click();
  URL.revokeObjectURL(url);
}
