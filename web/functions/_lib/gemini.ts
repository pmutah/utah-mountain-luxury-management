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

Properties (pick the best match from bill context):
- ranch: "The Ranch House", 270 East Center Street, Lindon, Utah 84042
- lindon: "The Lindon House", 143 Harcliff Circle, Lindon, Utah 84042

Categories (pick one): Maintenance, Supplies, Utilities, Cleaning, Insurance, HOA, Landscaping, Other

Return ONLY valid JSON:
{"expenses":[{"amount":number,"category":string,"month":"YYYY-MM","propertyId":"ranch"|"lindon"|null,"vendor":string,"note":string,"confidence":"high"|"low"}]}

Rules:
- A document may contain ONE or MANY bills/charges; emit one object per distinct bill or charge
- amount is total paid in USD (positive number)
- month is expense month YYYY-MM from billing/statement period or due date (NOT scan date)
- propertyId null if truly unknown; set confidence "low" when property OR month is ambiguous
- confidence "high" only when both propertyId and month are clear from the document
- note: brief description of what was purchased or billed`;

const SINGLE_PROMPT = `${PROMPT}

For a single receipt, return exactly one item in the expenses array.`;

function buildHintLine(hints: { propertyId?: string; month?: string }): string {
  return [
    hints.propertyId ? `User selected property: ${hints.propertyId}` : '',
    hints.month ? `User selected month: ${hints.month}` : '',
  ]
    .filter(Boolean)
    .join('. ');
}

function normalizeExpense(raw: ParsedExpense): ParsedExpense {
  const parsed = { ...raw };
  if (!Number.isFinite(parsed.amount) || parsed.amount <= 0) {
    throw new Error('Could not detect a valid expense amount');
  }
  if (!parsed.category) parsed.category = 'Other';
  if (!parsed.month || !/^\d{4}-\d{2}$/.test(parsed.month)) {
    const now = new Date();
    parsed.month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    parsed.confidence = 'low';
  }
  if (parsed.propertyId !== 'ranch' && parsed.propertyId !== 'lindon') {
    parsed.propertyId = null;
    parsed.confidence = 'low';
  }
  if (!parsed.confidence) {
    parsed.confidence =
      parsed.propertyId && /^\d{4}-\d{2}$/.test(parsed.month) ? 'high' : 'low';
  }
  return parsed;
}

function parseBatchResponse(raw: string): ParsedExpense[] {
  const json = JSON.parse(raw) as ParsedExpenseBatch | ParsedExpense;
  const items = Array.isArray((json as ParsedExpenseBatch).expenses)
    ? (json as ParsedExpenseBatch).expenses
    : [json as ParsedExpense];
  if (items.length === 0) throw new Error('No expenses found in document');
  return items.map(normalizeExpense);
}

async function callGemini(
  apiKey: string,
  parts: Array<{ text?: string; inline_data?: { mime_type: string; data: string } }>,
): Promise<string> {
  const model = 'gemini-2.5-flash';
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1,
        },
      }),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error: ${res.status} ${err.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const raw = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!raw) throw new Error('No response from Gemini');
  return raw;
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
  return parseBatchResponse(raw);
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
  return parseBatchResponse(raw)[0]!;
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
  return parseBatchResponse(raw)[0]!;
}
