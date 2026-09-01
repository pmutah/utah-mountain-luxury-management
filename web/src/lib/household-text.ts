const HOUSEHOLD_CATEGORIES = ['Furnishings', 'Decor', 'Supplies', 'Other'] as const;

export type HouseholdCategory = (typeof HOUSEHOLD_CATEGORIES)[number];

export type HouseholdTextParse = {
  amount: number | null;
  description: string;
  category: HouseholdCategory | null;
};

const MONEY_RE = /\$\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)|(\d{1,3}(?:,\d{3})*\.\d{2})/g;

const FURNISHINGS_RE =
  /\b(dresser|sofa|couch|loveseat|sectional|bed|mattress|nightstand|headboard|table|desk|chair|stool|ottoman|lamp|lighting|furniture|cabinet|bookshelf|wardrobe|mirror)\b/i;
const DECOR_RE =
  /\b(decor|décor|art|print|vase|candle|frame|pillow|throw|rug|curtain|blind|plant|wreath)\b/i;
const SUPPLIES_RE =
  /\b(towel|linens?|sheet|blanket|soap|shampoo|paper|trash|supply|supplies|costco|sam'?s| spoons?|plates?|utensil)\b/i;

export function looksLikeReceiptText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (MONEY_RE.test(trimmed)) return true;
  MONEY_RE.lastIndex = 0;
  return trimmed.split(/\r?\n/).filter((line) => line.trim()).length >= 2 && /\d/.test(trimmed);
}

export function parseHouseholdText(text: string): HouseholdTextParse {
  const trimmed = text.replace(/\u00a0/g, ' ').trim();
  MONEY_RE.lastIndex = 0;
  const matches = [...trimmed.matchAll(MONEY_RE)];
  let amount: number | null = null;
  if (matches.length > 0) {
    const last = matches[matches.length - 1]!;
    const raw = (last[1] || last[2] || '').replace(/,/g, '');
    const value = Number(raw);
    if (Number.isFinite(value) && value > 0) amount = value;
  }

  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const descriptive = lines.filter((line) => !/^\$?\s*[\d,]+\.?\d*\s*$/.test(line));
  const source = descriptive[0] || lines[0] || trimmed;
  const description = source
    .replace(/\$\s*[\d,]+\.?\d*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);

  let category: HouseholdCategory | null = null;
  if (FURNISHINGS_RE.test(trimmed)) category = 'Furnishings';
  else if (DECOR_RE.test(trimmed)) category = 'Decor';
  else if (SUPPLIES_RE.test(trimmed)) category = 'Supplies';

  return { amount, description, category };
}

export function isHouseholdCategory(value: string | undefined): value is HouseholdCategory {
  return Boolean(value && (HOUSEHOLD_CATEGORIES as readonly string[]).includes(value));
}
