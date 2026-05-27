import {
  ADDRESS_RULES_PROMPT,
  filterPortfolioExpenses,
} from './expense-address';
import {
  MONTH_ASSIGNMENT_PROMPT,
  resolveExpenseMonth,
  type MonthInferenceContext,
} from './expense-month';
import { applyRockyMountainPowerVendor } from './expense-vendors';
import { generateGeminiJson, type GeminiPart } from './gemini-call';

export interface ParsedExpense {
  amount: number;
  category: string;
  month: string;
  propertyId: 'ranch' | 'lindon' | null;
  vendor?: string;
  note?: string;
  confidence?: 'high' | 'low';
}

export interface ParsedExpenseBatch {
  expenses: ParsedExpense[];
}

const PROMPT = `You extract vacation-rental expenses for Utah Mountain Luxury Portfolio.

${ADDRESS_RULES_PROMPT}

${MONTH_ASSIGNMENT_PROMPT}

Categories (pick one): Maintenance, Supplies, Utilities, Cleaning, Insurance, HOA, Landscaping, Other

Return ONLY valid JSON:
{"expenses":[{"amount":number,"category":string,"month":"YYYY-MM","propertyId":"ranch"|"lindon"|null,"vendor":string,"note":string,"confidence":"high"|"low"}]}

Rules:
- A document may contain ZERO, ONE, or TWO expenses — only for 270 East Center Street and/or 143 Harcliff Circle (never other addresses)
- amount is total paid in USD for THAT service address only (positive number)
- month: follow MONTH assignment rules above (never use import/scan date)
- propertyId null if truly unknown; set confidence "low" when property OR month is ambiguous
- confidence "high" only when both propertyId and month are clear from the document
- note: brief description plus which service address the charge applies to
- vendor: use exact names when applicable — "Lindon City Utilities", "Rocky Mountain Power", "Enbridge Gas", "X-Mission Internet", "Hospitable Software"`;

const SINGLE_PROMPT = `${PROMPT}

For a single receipt, return exactly one item in the expenses array.`;

function buildHintLine(hints: { propertyId?: string; month?: string }): string {
  return [
    hints.propertyId ? `User selected property: ${hints.propertyId}` : '',
    hints.month
      ? `If the document has no billing or statement date, you may use ${hints.month} as month (last resort only).`
      : '',
  ]
    .filter(Boolean)
    .join('. ');
}

function normalizeExpense(raw: ParsedExpense, context: MonthInferenceContext = {}): ParsedExpense {
  const parsed = { ...raw };
  if (!Number.isFinite(parsed.amount) || parsed.amount <= 0) {
    throw new Error('Could not detect a valid expense amount');
  }
  if (!parsed.category) parsed.category = 'Other';

  const { month, confidencePenalty } = resolveExpenseMonth(
    parsed.month,
    parsed.note,
    context,
  );
  parsed.month = month;
  if (confidencePenalty) parsed.confidence = 'low';

  if (parsed.propertyId !== 'ranch' && parsed.propertyId !== 'lindon') {
    parsed.propertyId = null;
    parsed.confidence = 'low';
  }
  if (!parsed.confidence) {
    parsed.confidence =
      parsed.propertyId && !confidencePenalty ? 'high' : 'low';
  }
  return applyRockyMountainPowerVendor(parsed, { fileName: context.fileName });
}

function parseBatchResponse(raw: string, context: MonthInferenceContext = {}): ParsedExpense[] {
  const json = JSON.parse(raw) as ParsedExpenseBatch | ParsedExpense;
  const items = Array.isArray((json as ParsedExpenseBatch).expenses)
    ? (json as ParsedExpenseBatch).expenses
    : [json as ParsedExpense];
  if (items.length === 0) throw new Error('No expenses found in document');
  return filterPortfolioExpenses(items.map((item) => normalizeExpense(item, context)));
}

function callGemini(apiKey: string, parts: GeminiPart[]): Promise<string> {
  return generateGeminiJson(apiKey, parts);
}

export async function parseExpensesFromDocument(
  apiKey: string,
  base64: string,
  mimeType: string,
  fileName?: string,
): Promise<ParsedExpense[]> {
  const allowed =
    mimeType === 'application/pdf' || mimeType.startsWith('image/');
  if (!allowed) {
    throw new Error('Unsupported file type. Use PDF or image.');
  }

  const fileLine = fileName ? `File name: ${fileName}` : '';
  const raw = await callGemini(apiKey, [
    {
      text: `${PROMPT}\n\n${fileLine}\n\nExtract all bills/expenses from this document.`,
    },
    { inline_data: { mime_type: mimeType, data: base64 } },
  ]);
  return parseBatchResponse(raw, { fileName });
}

export async function parseExpenseFromText(
  apiKey: string,
  text: string,
  hints: { propertyId?: string; month?: string },
): Promise<ParsedExpense> {
  const hintLine = buildHintLine(hints);
  const raw = await callGemini(apiKey, [
    { text: `${SINGLE_PROMPT}\n\n${hintLine}\n\nReceipt or expense text:\n${text}` },
  ]);
  return parseBatchResponse(raw, { fallbackMonth: hints.month })[0]!;
}

export async function parseExpenseFromImage(
  apiKey: string,
  base64: string,
  mimeType: string,
  hints: { propertyId?: string; month?: string },
): Promise<ParsedExpense> {
  const hintLine = buildHintLine(hints);
  const raw = await callGemini(apiKey, [
    { text: `${SINGLE_PROMPT}\n\n${hintLine}\n\nExtract expense from this receipt image.` },
    { inline_data: { mime_type: mimeType, data: base64 } },
  ]);
  return parseBatchResponse(raw, { fallbackMonth: hints.month })[0]!;
}
