import { resolveExpenseMonth, type MonthInferenceContext } from './expense-month';
import { generateGeminiJson, type GeminiPart } from './gemini-call';
import type { ParsedExpense } from './gemini';

const HOUSEHOLD_CATEGORIES = ['Furnishings', 'Decor', 'Supplies', 'Other'] as const;

const HOUSEHOLD_PROMPT = `You extract a household purchase for Brandon and Stephanie (furnishings, decor, supplies, and things they buy for their house).

This is NOT a vacation-rental utility bill. Do not require a property address. Store receipts, order confirmations, checkout pages, Amazon/Wayfair/Costco/Target screenshots, invoices, and payment emails are all valid.

Categories (pick one): Furnishings, Decor, Supplies, Other

Return ONLY valid JSON:
{"expenses":[{"amount":number,"category":string,"month":"YYYY-MM","vendor":string,"note":string,"confidence":"high"|"low"}]}

Rules:
- Always return exactly one expense if any dollar amount is visible
- amount is the order total / grand total / amount paid in USD (positive). Prefer the final total, not a tax-only or shipping-only line
- month: transaction or order date on the receipt as YYYY-MM. If no date, omit month
- vendor: store or site name (Wayfair, Costco, Amazon, Target, Home Depot, etc.)
- note: short description of what was bought (e.g. "Queen bed frame", "Bath towels")
- Screenshots of carts, emails, and confirmation pages still count — read the total and the item
- confidence "high" when both amount and what was bought are clear`;

function mapHouseholdCategory(raw: string | undefined): string {
  const value = (raw ?? '').trim();
  if ((HOUSEHOLD_CATEGORIES as readonly string[]).includes(value)) return value;
  const lower = value.toLowerCase();
  if (/\b(furniture|furnish|bed|sofa|lamp|table|chair)\b/.test(lower)) return 'Furnishings';
  if (/\b(decor|art|pillow|rug)\b/.test(lower)) return 'Decor';
  if (/\b(suppl|clean|towel|linen)\b/.test(lower)) return 'Supplies';
  if (lower === 'maintenance' || lower === 'landscaping') return 'Furnishings';
  return 'Other';
}

export function normalizeHouseholdExpense(
  raw: Partial<ParsedExpense>,
  context: MonthInferenceContext = {},
): ParsedExpense {
  const amount = Number(raw.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Could not detect a valid expense amount');
  }
  const note = raw.note?.trim() || raw.vendor?.trim() || 'Household purchase';
  const { month } = resolveExpenseMonth(raw.month, note, context);
  return {
    amount,
    category: mapHouseholdCategory(raw.category),
    month,
    propertyId: null,
    vendor: raw.vendor?.trim() || undefined,
    note,
    confidence: raw.confidence === 'high' ? 'high' : 'low',
  };
}

function parseHouseholdResponse(raw: string, context: MonthInferenceContext): ParsedExpense {
  const json = JSON.parse(raw) as { expenses?: Partial<ParsedExpense>[] } | Partial<ParsedExpense>;
  const items = Array.isArray((json as { expenses?: Partial<ParsedExpense>[] }).expenses)
    ? (json as { expenses: Partial<ParsedExpense>[] }).expenses
    : [json as Partial<ParsedExpense>];
  if (items.length === 0) throw new Error('No expenses found in screenshot');
  return normalizeHouseholdExpense(items[0]!, context);
}

function hintLine(hints: { month?: string }): string {
  return hints.month
    ? `If the receipt has no date, you may use ${hints.month} as month.`
    : '';
}

export async function parseHouseholdExpenseFromText(
  apiKey: string,
  text: string,
  hints: { month?: string },
): Promise<ParsedExpense> {
  const raw = await generateGeminiJson(apiKey, [
    { text: `${HOUSEHOLD_PROMPT}\n\n${hintLine(hints)}\n\nReceipt or order text:\n${text}` },
  ]);
  return parseHouseholdResponse(raw, { fallbackMonth: hints.month });
}

export async function parseHouseholdExpenseFromImage(
  apiKey: string,
  base64: string,
  mimeType: string,
  hints: { month?: string },
): Promise<ParsedExpense> {
  const parts: GeminiPart[] = [
    { text: `${HOUSEHOLD_PROMPT}\n\n${hintLine(hints)}\n\nExtract the purchase from this screenshot or receipt.` },
    { inline_data: { mime_type: mimeType, data: base64 } },
  ];
  const raw = await generateGeminiJson(apiKey, parts);
  return parseHouseholdResponse(raw, { fallbackMonth: hints.month });
}
