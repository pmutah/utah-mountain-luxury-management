import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { buildLienReleasePdf, formatUsd, usdToWords, type LienReleaseFields } from './lien-release';
import { getFormTemplate, resolveSite } from './form-library';

const INK = rgb(0.08, 0.09, 0.12);
const MUTED = rgb(0.28, 0.3, 0.34);
const RULE = rgb(0.75, 0.77, 0.8);
const PAGE: [number, number] = [612, 792];
const MARGIN = 54;
const WIDTH = 612 - MARGIN * 2;

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

function str(values: Record<string, string | number>, key: string, fallback = ''): string {
  const v = values[key];
  if (v == null || v === '') return fallback;
  return String(v);
}

function money(values: Record<string, string | number>, key: string): string {
  const n = Number(values[key] ?? 0);
  if (!Number.isFinite(n) || n === 0) return '—';
  return `${formatUsd(n)} (${usdToWords(n)})`;
}

async function buildLetterheadPdf(input: {
  title: string;
  subtitle?: string;
  propertyName: string;
  propertyAddress: string;
  owners: string;
  fields: Array<{ label: string; value: string }>;
  paragraphs: string[];
  signerName: string;
  footer?: string;
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.TimesRoman);
  const bold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const italic = await pdf.embedFont(StandardFonts.TimesRomanItalic);

  let page = pdf.addPage(PAGE);
  const y = { y: 742 };

  const ensure = (need = 56) => {
    if (y.y >= need) return;
    page = pdf.addPage(PAGE);
    y.y = 742;
  };

  const text = (
    content: string,
    opts?: { size?: number; bold?: boolean; italic?: boolean; gap?: number; color?: ReturnType<typeof rgb> },
  ) => {
    const size = opts?.size ?? 10;
    const f = opts?.bold ? bold : opts?.italic ? italic : font;
    for (const line of wrapWords(content, f, size, WIDTH)) {
      ensure();
      page.drawText(line, { x: MARGIN, y: y.y, size, font: f, color: opts?.color ?? INK });
      y.y -= size + 3;
    }
    y.y -= opts?.gap ?? 0;
  };

  page.drawText('UTAH MOUNTAIN LUXURY MANAGEMENT', {
    x: MARGIN,
    y: y.y,
    size: 9,
    font: bold,
    color: MUTED,
  });
  y.y -= 18;
  text(input.title, { size: 14, bold: true, gap: 4 });
  if (input.subtitle) text(input.subtitle, { size: 8.5, italic: true, color: MUTED, gap: 6 });
  page.drawLine({
    start: { x: MARGIN, y: y.y },
    end: { x: MARGIN + WIDTH, y: y.y },
    thickness: 1,
    color: RULE,
  });
  y.y -= 20;

  const headerFields = [
    { label: 'Property', value: input.propertyName },
    { label: 'Address', value: input.propertyAddress },
    { label: 'Owner / management', value: input.owners },
    ...input.fields.filter((f) => f.value && f.value !== '—'),
  ];
  for (const field of headerFields) {
    ensure(80);
    page.drawText(field.label, { x: MARGIN, y: y.y, size: 9, font: bold, color: MUTED });
    y.y -= 14;
    for (const line of wrapWords(field.value, font, 11, WIDTH)) {
      ensure();
      page.drawText(line, { x: MARGIN, y: y.y, size: 11, font, color: INK });
      y.y -= 14;
    }
    y.y -= 6;
  }

  for (const para of input.paragraphs) {
    text(para, { size: 10, gap: 10 });
  }

  y.y -= 8;
  ensure(140);
  text('Date: ________________________', { size: 11, gap: 18 });
  text(input.signerName || 'Signer', { size: 12, bold: true, gap: 16 });
  text('Signature: ____________________________________________', { size: 11, gap: 16 });
  text('Printed name: _________________________________________', { size: 11, gap: 16 });
  text('Title / company: ______________________________________', { size: 11, gap: 20 });
  text(input.footer ?? 'Utah Mountain Luxury Management  ·  e-sign packet', {
    size: 8,
    italic: true,
    color: MUTED,
  });

  return pdf.save();
}

function drawStatutoryForm(
  page: PDFPage,
  fonts: { font: PDFFont; bold: PDFFont; italic: PDFFont },
  title: string,
  fields: Array<{ label: string; value: string }>,
  body: string[],
  company: string,
) {
  const { font, bold, italic } = fonts;
  const y = { y: 742 };
  const draw = (content: string, opts?: { size?: number; bold?: boolean; italic?: boolean; gap?: number }) => {
    const size = opts?.size ?? 10.5;
    const f = opts?.bold ? bold : opts?.italic ? italic : font;
    for (const line of wrapWords(content, f, size, WIDTH)) {
      page.drawText(line, { x: MARGIN, y: y.y, size, font: f, color: INK });
      y.y -= size + 3;
    }
    y.y -= opts?.gap ?? 0;
  };

  draw(title, { size: 13, bold: true, gap: 4 });
  draw('Utah Code Ann. § 38-1a-802 statutory form', { size: 8.5, italic: true, gap: 8 });
  page.drawLine({
    start: { x: MARGIN, y: y.y },
    end: { x: MARGIN + WIDTH, y: y.y },
    thickness: 1,
    color: RULE,
  });
  y.y -= 20;
  for (const field of fields) {
    page.drawText(`${field.label}:`, { x: MARGIN, y: y.y, size: 10, font: bold, color: MUTED });
    const labelW = bold.widthOfTextAtSize(`${field.label}: `, 10);
    const valueLines = wrapWords(field.value || '—', font, 11, WIDTH - labelW);
    page.drawText(valueLines[0] ?? '—', {
      x: MARGIN + labelW,
      y: y.y,
      size: 11,
      font,
      color: INK,
    });
    y.y -= 16;
    for (const extra of valueLines.slice(1)) {
      page.drawText(extra, { x: MARGIN + labelW, y: y.y, size: 11, font, color: INK });
      y.y -= 14;
    }
    y.y -= 4;
  }
  y.y -= 6;
  for (const para of body) draw(para, { size: 10, gap: 10 });
  y.y -= 8;
  draw(`Dated: ________________________`, { size: 11, gap: 18 });
  draw(company, { size: 11, bold: true, gap: 16 });
  draw('By: ________________________________________________', { size: 11, gap: 16 });
  draw('Its: _______________________________________________', { size: 11, gap: 24 });
  draw('Utah Mountain Luxury Management  ·  statutory Utah lien waiver', {
    size: 8,
    italic: true,
  });
}

async function buildStatutoryWaiverPdf(
  kind: 'progress' | 'final',
  values: Record<string, string | number>,
): Promise<Uint8Array> {
  const site = resolveSite(values.propertyId);
  const company = str(values, 'contractorName');
  const customer = str(values, 'customer', 'Utah Mountain Luxury Management');
  const invoice = str(values, 'invoiceNo');
  const amount = money(values, 'amountUsd');
  const period = str(values, 'paymentPeriod');

  const pdf = await PDFDocument.create();
  const fonts = {
    font: await pdf.embedFont(StandardFonts.TimesRoman),
    bold: await pdf.embedFont(StandardFonts.TimesRomanBold),
    italic: await pdf.embedFont(StandardFonts.TimesRomanItalic),
  };
  const page = pdf.addPage(PAGE);

  if (kind === 'progress') {
    drawStatutoryForm(
      page,
      fonts,
      'UTAH CONDITIONAL WAIVER AND RELEASE UPON PROGRESS PAYMENT',
      [
        { label: 'Property Name', value: site.name },
        { label: 'Property Location', value: site.address },
        { label: "Undersigned's Customer", value: customer },
        { label: 'Invoice/Payment Application Number', value: invoice },
        { label: 'Payment Amount', value: amount },
        { label: 'Payment Period', value: period },
      ],
      [
        'To the extent provided below, this document becomes effective to release and the undersigned is considered to waive any notice of lien or right under Utah Code Ann., Title 38, Chapter 1a, Preconstruction and Construction Liens, or any bond right under Utah Code Ann., Title 14, Contractors\' Bonds, or Section 63G-6a-1103 related to payment rights the undersigned has on the above described Property once:',
        '(1) the undersigned endorses a check in the above referenced Payment Amount payable to the undersigned; and',
        '(2) the check is paid by the depository institution on which it is drawn.',
        'This waiver and release applies to a progress payment for the work, materials, equipment, or a combination of work, materials, and equipment furnished by the undersigned to the Property or to the Undersigned\'s Customer which are the subject of the Invoice or Payment Application, but only to the extent of the Payment Amount. This waiver and release does not apply to any retention withheld; any items, modifications, or changes pending approval; disputed items and claims; or items furnished or invoiced after the Payment Period.',
        'The undersigned warrants that the undersigned either has already paid or will use the money the undersigned receives from this progress payment promptly to pay in full all the undersigned\'s laborers, subcontractors, materialmen, and suppliers for all work, materials, equipment, or combination of work, materials, and equipment that are the subject of this waiver and release.',
      ],
      company,
    );
  } else {
    drawStatutoryForm(
      page,
      fonts,
      'UTAH WAIVER AND RELEASE UPON FINAL PAYMENT',
      [
        { label: 'Property Name', value: site.name },
        { label: 'Property Location', value: site.address },
        { label: "Undersigned's Customer", value: customer },
        { label: 'Invoice/Payment Application Number', value: invoice },
        { label: 'Payment Amount', value: amount },
      ],
      [
        'To the extent provided below, this document becomes effective to release and the undersigned is considered to waive any notice of lien or right under Utah Code Ann., Title 38, Chapter 1a, Preconstruction and Construction Liens, or any bond right under Utah Code Ann., Title 14, Contractors\' Bonds, or Section 63G-6a-1103 related to payment rights the undersigned has on the above described Property once:',
        '(1) the undersigned endorses a check in the above referenced Payment Amount payable to the undersigned; and',
        '(2) the check is paid by the depository institution on which it is drawn.',
        'This waiver and release applies to the final payment for the work, materials, equipment, or combination of work, materials, and equipment furnished by the undersigned to the Property or to the Undersigned\'s Customer.',
        'The undersigned warrants that the undersigned either has already paid or will use the money the undersigned receives from the final payment promptly to pay in full all the undersigned\'s laborers, subcontractors, materialmen, and suppliers for all work, materials, equipment, or combination of work, materials, and equipment that are the subject of this waiver and release.',
      ],
      company,
    );
  }
  return pdf.save();
}

function contactLine(values: Record<string, string | number>): string {
  return [str(values, 'phone') && `Phone: ${str(values, 'phone')}`, str(values, 'email') && `Email: ${str(values, 'email')}`]
    .filter(Boolean)
    .join('  |  ');
}

const BODIES: Record<string, (siteName: string, values: Record<string, string | number>) => string[]> = {
  'work-authorization': (site, v) => [
    `Utah Mountain Luxury Management authorizes ${str(v, 'contractorName')} to perform the work below at ${site}.`,
    `Scope: ${str(v, 'scope')}`,
    str(v, 'startDate') ? `Work may begin on ${str(v, 'startDate')}.` : 'Work may begin after this authorization is signed.',
    `The authorized amount is ${money(v, 'amountUsd')}. Extra work requires a signed change order.`,
    'The contractor will keep the property reasonably clean, carry insurance required by management, and invoice only for authorized work.',
  ],
  'change-order': (site, v) => [
    `This change order amends the job for ${str(v, 'contractorName')} at ${site}.`,
    str(v, 'originalRef') ? `Original job / invoice: ${str(v, 'originalRef')}.` : '',
    `Change: ${str(v, 'scope')}`,
    `The contract price changes by ${money(v, 'amountUsd')}. All other terms stay the same unless written here.`,
  ],
  'notice-to-proceed': (site, v) => [
    `${str(v, 'contractorName')} may proceed with the work below at ${site} beginning ${str(v, 'startDate')}.`,
    `Work to begin: ${str(v, 'scope')}`,
    'This notice does not waive lien rights and is not a payment. Utah Mountain Luxury Management may stop work for safety, access, or guest occupancy.',
  ],
  'punch-list': (site, v) => [
    `${str(v, 'contractorName')} agrees the items below remain unfinished at ${site} and will complete them${str(v, 'dueDate') ? ` by ${str(v, 'dueDate')}` : ''}.`,
    `Remaining items: ${str(v, 'scope')}`,
    'When these items are finished, the contractor will notify Utah Mountain Luxury Management so we can inspect.',
  ],
  'payment-receipt': (site, v) => [
    `${str(v, 'contractorName')} acknowledges receipt of ${money(v, 'amountUsd')} from Utah Mountain Luxury Management for work at ${site}.`,
    str(v, 'invoiceNo') ? `Reference: ${str(v, 'invoiceNo')}.` : '',
    `This payment covers: ${str(v, 'scope')}`,
    'This receipt is not a Utah statutory lien waiver. A separate § 38-1a-802 waiver is required to release lien rights.',
  ],
  'cleaning-agreement': (site, v) => [
    `${str(v, 'contractorName')} will provide turnover cleaning at ${site} for ${money(v, 'amountUsd')} per completed turnover, unless a different amount is written on a later work order.`,
    `Scope: ${str(v, 'scope')}`,
    'The cleaner will leave the house guest-ready, report damage or missing items the same day, and will not leave access codes on this form or in photos.',
  ],
  'maintenance-work-order': (site, v) => [
    `Utah Mountain Luxury Management requests the following work at ${site} from ${str(v, 'contractorName')}.`,
    `Work requested: ${str(v, 'scope')}`,
    Number(v.amountUsd) ? `Quoted / not-to-exceed: ${money(v, 'amountUsd')}.` : 'Price to be confirmed in writing before extra parts or labor.',
    'Do not start work beyond this order without approval. Invoice Utah Mountain Luxury Management after completion.',
  ],
  'property-access': (site, v) => [
    `${str(v, 'contractorName')} is granted temporary access to ${site} only for the work or service they were hired to do.`,
    `Access notes: ${str(v, 'scope')}`,
    'Do not share codes, keys, lockbox locations, or alarm details. Relock every door, restore the alarm if used, and do not leave the house unsecured. Access ends when the job ends or when management says so.',
  ],
  'coi-acknowledgment': (site, v) => [
    `${str(v, 'contractorName')} confirms that current insurance for work at ${site === 'Utah Mountain Luxury portfolio' ? 'Utah Mountain Luxury properties' : site} has been given to Utah Mountain Luxury Management.`,
    str(v, 'policyNo') ? `Certificate / policy: ${str(v, 'policyNo')}.` : '',
    str(v, 'expires') ? `Expiration: ${str(v, 'expires')}.` : '',
    'The signer will send a new certificate before coverage lapses and will not work on a property without required coverage in force.',
  ],
  'w9-on-file': (_site, v) => [
    `${str(v, 'contractorName')} confirms a current IRS Form W-9 was delivered to Utah Mountain Luxury Management${str(v, 'taxYear') ? ` for tax year ${str(v, 'taxYear')}` : ''}.`,
    'This acknowledgment is not a W-9. The IRS form itself stays in the vendor file. The payee will send a new W-9 if their name, tax ID, or classification changes.',
  ],
  'guest-liability-waiver': (site, v) => {
    const guest = str(v, 'contractorName');
    const dates = str(v, 'stayDates');
    const occ = str(v, 'occupancy');
    const booked = str(v, 'bookingSource');
    return [
      `This is a legally binding contract. ${guest} (Guest) is the booking lead for ${site}${dates ? ` for ${dates}` : ''}${occ ? ` (${occ} overnight guests)` : ''}${booked ? `, booked on ${booked}` : ''}. Guest signs for every adult, child, visitor, and invitee who enters the property during the stay (the Party). Anyone who will not accept these terms may not come onto the property.`,
      'This agreement is in addition to Airbnb, VRBO, or other platform terms. Platform terms do not replace this waiver.',
      'ASSUMPTION OF RISK. Guest understands that a private home, yard, and mountain or canyon setting have inherent risks. No lifeguard, ranger, or on-site staff is on duty. Guest voluntarily assumes all risk of injury, illness, drowning, death, and property loss for Guest and the Party, including: slips, trips, and falls on floors, rugs, stairs, decks, patios, walkways, gravel, mud, ice, snow, and wet surfaces; stairs, railings, decks, balconies, and upper levels; hot tub or spa if present (drowning, burns, slips, cardiac events, infection, pregnancy-related harm, unsupervised use); the Provo River, creeks, and Provo Canyon terrain especially at The River House (swift or cold water, rocks, drop-offs, currents, debris, flooding, steep banks); outdoor cooking, fire pits, fireplaces, grills, and heaters; weather, altitude, wildlife, and darkness; vehicles and driveways; and Guest\'s own activities including alcohol, sports, hiking, and water play.',
      'Children must be watched by a responsible adult at all times around water, stairs, decks, hot tubs, streets, and the river. Guest is solely responsible for the day-to-day safety of the Party.',
      'HOT TUB (if present): No lifeguard. No glass. No children without a sober adult in the tub area. Children who are not toilet-trained are not allowed in the tub. Do not use if you have heart issues, are pregnant, or are impaired. Do not sit on the cover. Secure the cover after use. Do not change equipment settings.',
      'RIVER AND CANYON: The River House sits in Provo Canyon near the Provo River. The river is not a pool and is not supervised. Do not dive or jump from rocks or decks into water. Keep children away from the water unless a sober adult is within arm\'s reach. Host is not responsible for anyone who leaves the yard for the river, trail, or road.',
      'RELEASE. To the fullest extent allowed by Utah law, Guest releases, waives, and will not sue Utah Mountain Luxury Management, its owners, members, managers, employees, and agents, and the property owners (Todd Wilhite and/or Brandon Pierce, as applicable) (together, Host) for any claim, injury, illness, drowning, death, or loss of personal property arising out of the stay or use of the property, amenities, yard, parking, hot tub, river, canyon, or nearby public land, including claims based on ordinary negligence of Host. This waiver does not apply to Host\'s gross negligence, willful misconduct, or fraud.',
      'INDEMNITY. Guest will defend, indemnify, and hold Host harmless from claims, damages, attorney fees, and costs brought by anyone in the Party, or by anyone Guest allowed onto the property, related to the stay, except to the extent caused by Host\'s gross negligence, willful misconduct, or fraud. This release binds Guest, the Party, and Guest\'s heirs.',
      'Host does not insure Guest belongings or vehicles. Guest is encouraged to carry travel and medical insurance. Governing law: Utah. Venue: Utah County, Utah. If a court strikes one clause, the rest still applies.',
    ];
  },
  'guest-stay-agreement': (site, v) => {
    const guest = str(v, 'contractorName');
    const dates = str(v, 'stayDates');
    const occ = str(v, 'occupancy');
    const booked = str(v, 'bookingSource');
    return [
      `1. PARTIES AND STAY. This agreement is between Utah Mountain Luxury Management (including its owners, members, managers, employees, and agents) and the owners of the property (Todd Wilhite and/or Brandon Pierce, as applicable) (together, Host) and ${guest} (Guest). Property: ${site}. Stay: ${dates || 'dates on the reservation'}${occ ? `. Overnight guests: ${occ}` : ''}${booked ? `. Booked on: ${booked}` : ''}.`,
      'Guest is the booking lead and represents they have authority to bind every adult, child, visitor, and invitee who enters the property during the stay (the Party). If someone in the Party will not accept these terms, they may not come onto the property. This agreement is in addition to Airbnb, VRBO, or other platform terms. Platform terms do not replace this agreement.',
      '2. LICENSE TO OCCUPY. Host grants Guest a short-term license to occupy the property for the stay dates only. This is not a residential lease. Guest will leave at checkout, follow house rules, and keep occupancy at or below the booked number. Parties, events, and unregistered overnight guests are not allowed without Host\'s written approval.',
      'The property is provided as-is. Host will try to keep it in working order, but does not guarantee uninterrupted utilities, internet, appliances, heat, A/C, or amenities. A broken amenity is not a reason to sue or to treat the stay as cancelled unless Host agrees in writing.',
      '3. ASSUMPTION OF RISK. Guest understands that a private home, yard, and mountain or canyon setting have inherent risks. No lifeguard, ranger, or on-site staff is on duty. Guest voluntarily assumes all risk of injury, illness, drowning, death, and property loss for Guest and the Party, including: slips, trips, and falls on floors, rugs, stairs, decks, patios, walkways, gravel, mud, ice, snow, and wet surfaces; stairs, railings, decks, balconies, and loft or upper levels; hot tub, spa, or similar water amenity if present (drowning, burns, slips, cardiac events, infection, pregnancy-related harm, and unsupervised use); the Provo River, creeks, irrigation, ponds, and Provo Canyon terrain especially at The River House (swift or cold water, rocks, drop-offs, currents, debris, flooding, and steep banks); outdoor cooking, fire pits, fireplaces, grills, and heaters (burns, smoke, fire, and carbon monoxide); weather, altitude, wildlife, insects, and darkness; vehicles, parking, driveways, and road access; other guests or third parties; and Guest\'s own activities including alcohol, sports, hiking, water play, and night use of the property.',
      'Guest is solely responsible for the day-to-day safety of the Party, including children. Children must be watched by a responsible adult at all times around water, stairs, decks, hot tubs, streets, and the river.',
      '4. HOT TUB / SPA (if the property has one). No lifeguard. Use at your own risk. No glass in or around the tub. No children without a sober adult in the tub area. Children who are not toilet-trained are not allowed in the tub. Do not use if you have heart issues, are pregnant, or are impaired by alcohol or drugs. Do not sit, stand, or play on the cover. Replace and secure the cover after use. Do not change equipment settings. Tell Host if the water looks or smells wrong. Host may close the tub at any time for maintenance or safety.',
      '5. RIVER, CANYON, AND OUTDOOR WATER. The River House sits in Provo Canyon near the Provo River. The river and canyon are not a pool, are not supervised, and can be dangerous in any season. Guest and the Party will stay off unsafe banks, will not dive or jump from rocks or decks into water, and will keep children away from the water unless a sober adult is within arm\'s reach. Host is not responsible for anyone who leaves the yard and goes to the river, trail, or road.',
      '6. RELEASE OF CLAIMS. To the fullest extent allowed by Utah law, Guest releases, waives, and will not sue Host for any claim, injury, illness, drowning, death, or loss of personal property arising out of the stay or use of the property, amenities, yard, parking, hot tub, river, canyon, or nearby public land, including claims based on ordinary negligence of Host. This waiver does not apply to Host\'s gross negligence, willful misconduct, or fraud. Those remain Host\'s responsibility under Utah law. This release binds Guest, the Party, and Guest\'s heirs, family, and anyone claiming through Guest.',
      '7. INDEMNITY. Guest will defend, indemnify, and hold Host harmless from claims, damages, attorney fees, and costs brought by anyone in the Party, or by anyone Guest allowed onto the property, related to the stay — including injury, death, and property damage — except to the extent caused by Host\'s gross negligence, willful misconduct, or fraud.',
      '8. PERSONAL PROPERTY AND INSURANCE. Host does not insure Guest\'s belongings, vehicles, or cash. Lock doors, and do not leave valuables in cars. Host recommends Guest carry travel insurance and medical coverage. Guest uses the property without relying on Host\'s insurance for Guest injuries.',
      '9. DAMAGE, SMOKING, AND RULES. Guest will pay for damage, missing items, extra cleaning, and unauthorized occupancy beyond normal wear. No smoking or vaping in the home. No fireworks. No illegal activity. Quiet hours and occupancy limits in the listing and house rules apply. Host may end the stay without refund for a serious rules violation or unsafe conduct.',
      '10. GOVERNING LAW. State of Utah. Venue: Utah County, Utah. If a court strikes one clause, the rest still applies. Guest has read this entire agreement, understands Guest is giving up the right to sue Host for ordinary negligence, and signs of Guest\'s own free will for Guest and the Party.',
    ];
  },
  'guest-damage-charge': (site, v) => [
    `${str(v, 'contractorName')} stayed at ${site}${str(v, 'stayDates') ? ` (${str(v, 'stayDates')})` : ''} and agrees Utah Mountain Luxury Management may charge ${money(v, 'amountUsd')} for the damage described below.`,
    `Damage: ${str(v, 'scope')}`,
    'The guest may pay this amount by the method management provides. This does not limit other amounts if more damage is found and documented.',
  ],
  'guest-extra-cleaning': (site, v) => [
    `${str(v, 'contractorName')} agrees to an extra cleaning charge of ${money(v, 'amountUsd')} for ${site}${str(v, 'stayDates') ? ` (${str(v, 'stayDates')})` : ''}.`,
    `Reason: ${str(v, 'scope')}`,
    'This is in addition to any standard turnover already collected on the reservation.',
  ],
  'guest-incident': (site, v) => [
    `${str(v, 'contractorName')} confirms the following incident at ${site}${str(v, 'incidentDate') ? ` on ${str(v, 'incidentDate')}` : ''}${str(v, 'stayDates') ? ` during the stay ${str(v, 'stayDates')}` : ''}.`,
    `What happened: ${str(v, 'scope')}`,
    'This acknowledgment records the facts as the guest understands them. It is not a release of claims unless a separate settlement is signed.',
  ],
  'owner-expense-approval': (site, v) => [
    `${str(v, 'contractorName')} approves the following spend for ${site} in the amount of ${money(v, 'amountUsd')}.`,
    `Spend: ${str(v, 'scope')}`,
    'Utah Mountain Luxury Management may book the work and pay the vendor up to this amount. Anything above it needs another approval.',
  ],
  'owner-decision-ack': (site, v) => [
    `${str(v, 'contractorName')} acknowledges the following management decision for ${site}.`,
    `Decision: ${str(v, 'scope')}`,
    'This does not change the ownership or management agreement except as written above.',
  ],
};

export async function buildFormPdf(
  templateId: string,
  values: Record<string, string | number>,
): Promise<Uint8Array> {
  const template = getFormTemplate(templateId);
  if (!template) throw new Error('Unknown form template.');

  if (templateId === 'river-final-release') {
    const fields: LienReleaseFields = {
      contractorName: str(values, 'contractorName'),
      contractorAddress: str(values, 'contractorAddress') || undefined,
      phone: str(values, 'phone') || undefined,
      email: str(values, 'email') || undefined,
      invoiceNo: str(values, 'invoiceNo') || undefined,
      invoiceDate: str(values, 'invoiceDate') || undefined,
      description: str(values, 'description'),
      amountUsd: Number(values.amountUsd ?? 0),
    };
    return buildLienReleasePdf(fields);
  }
  if (templateId === 'utah-progress-waiver') return buildStatutoryWaiverPdf('progress', values);
  if (templateId === 'utah-final-waiver') return buildStatutoryWaiverPdf('final', values);

  const site = resolveSite(values.propertyId);
  const bodyFn = BODIES[templateId];
  if (!bodyFn) throw new Error('This form does not have a PDF builder yet.');
  const extraFields: Array<{ label: string; value: string }> = [];
  const contact = contactLine(values);
  if (contact) extraFields.push({ label: 'Contact', value: contact });
  if (str(values, 'invoiceNo')) extraFields.push({ label: 'Invoice / reference', value: str(values, 'invoiceNo') });
  if (str(values, 'startDate')) extraFields.push({ label: 'Start date', value: str(values, 'startDate') });
  if (str(values, 'dueDate')) extraFields.push({ label: 'Complete by', value: str(values, 'dueDate') });
  if (str(values, 'stayDates')) extraFields.push({ label: 'Stay dates', value: str(values, 'stayDates') });
  if (str(values, 'occupancy')) extraFields.push({ label: 'Overnight guests', value: str(values, 'occupancy') });
  if (str(values, 'bookingSource')) extraFields.push({ label: 'Booked on', value: str(values, 'bookingSource') });
  if (values.amountUsd != null && Number(values.amountUsd) !== 0) {
    extraFields.push({ label: 'Amount', value: money(values, 'amountUsd') });
  }

  return buildLetterheadPdf({
    title: template.title,
    subtitle: template.description,
    propertyName: site.name,
    propertyAddress: site.address,
    owners: site.owners,
    fields: extraFields,
    paragraphs: bodyFn(site.name, values).filter(Boolean),
    signerName: str(values, template.signerField),
    footer: `Utah Mountain Luxury Management  ·  ${site.name}`,
  });
}
