export interface ParsedExpense {
  amount: number;
  category: string;
  month: string;
  propertyId: 'ranch' | 'lindon' | null;
  vendor?: string;
  note?: string;
}

const PROMPT = `You extract vacation-rental expenses for Wilhite Property Management.

Properties (pick the best match from receipt context or user hint):
- ranch: "The Ranch House", 270 E Center St (larger home, Provo area)
- lindon: "The Lindon House", 1011 E 100 N, Lindon UT (smaller home)

Categories (pick one): Maintenance, Supplies, Utilities, Cleaning, Insurance, HOA, Landscaping, Other

Return ONLY valid JSON:
{"amount": number, "category": string, "month": "YYYY-MM", "propertyId": "ranch"|"lindon"|null, "vendor": string, "note": string}

Rules:
- amount is the total paid in USD (positive number)
- month is expense month YYYY-MM (use receipt date; if missing use current month from context)
- propertyId null if truly unknown
- note: brief description of what was purchased`;

export async function parseExpenseFromText(
  apiKey: string,
  text: string,
  hints: { propertyId?: string; month?: string },
): Promise<ParsedExpense> {
  const hintLine = [
    hints.propertyId ? `User selected property: ${hints.propertyId}` : '',
    hints.month ? `User selected month: ${hints.month}` : '',
  ]
    .filter(Boolean)
    .join('. ');

  return callGemini(apiKey, [
    { text: `${PROMPT}\n\n${hintLine}\n\nReceipt or expense text:\n${text}` },
  ]);
}

export async function parseExpenseFromImage(
  apiKey: string,
  base64: string,
  mimeType: string,
  hints: { propertyId?: string; month?: string },
): Promise<ParsedExpense> {
  const hintLine = [
    hints.propertyId ? `User selected property: ${hints.propertyId}` : '',
    hints.month ? `User selected month: ${hints.month}` : '',
  ]
    .filter(Boolean)
    .join('. ');

  return callGemini(apiKey, [
    { text: `${PROMPT}\n\n${hintLine}\n\nExtract expense from this receipt image.` },
    { inline_data: { mime_type: mimeType, data: base64 } },
  ]);
}

async function callGemini(
  apiKey: string,
  parts: Array<{ text?: string; inline_data?: { mime_type: string; data: string } }>,
): Promise<ParsedExpense> {
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

  const parsed = JSON.parse(raw) as ParsedExpense;
  if (!Number.isFinite(parsed.amount) || parsed.amount <= 0) {
    throw new Error('Could not detect a valid expense amount');
  }
  if (!parsed.category) parsed.category = 'Other';
  if (!parsed.month || !/^\d{4}-\d{2}$/.test(parsed.month)) {
    const now = new Date();
    parsed.month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
  return parsed;
}
