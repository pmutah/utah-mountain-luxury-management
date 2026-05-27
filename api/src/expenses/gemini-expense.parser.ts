import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Expense } from '../common/metrics';
import { ADDRESS_RULES_PROMPT, filterPortfolioExpenses } from './expense-address';

const PROMPT = `You extract vacation-rental expenses for Utah Mountain Luxury Portfolio.
${ADDRESS_RULES_PROMPT}
Categories: Maintenance, Supplies, Utilities, Cleaning, Insurance, HOA, Landscaping, Other
Return ONLY JSON: {"expenses":[{"amount":number,"category":string,"month":"YYYY-MM","propertyId":"ranch"|"lindon"|null,"vendor":string,"note":string,"confidence":"high"|"low"}]}
Rules: one or many bills per document at portfolio addresses only; per-address amount not account total; confidence low if property or month ambiguous; note must include service address.`;

const SINGLE_PROMPT = `${PROMPT}\nFor a single receipt return one item in expenses array.`;

export interface ParsedExpense {
  amount: number;
  category: string;
  month: string;
  propertyId: 'ranch' | 'lindon' | null;
  vendor?: string;
  note?: string;
  confidence?: 'high' | 'low';
}

@Injectable()
export class GeminiExpenseParser {
  constructor(private readonly config: ConfigService) {}

  async parseText(text: string, hints: { propertyId?: string; month?: string }): Promise<ParsedExpense> {
    const hint = [hints.propertyId && `property: ${hints.propertyId}`, hints.month && `month: ${hints.month}`]
      .filter(Boolean)
      .join('. ');
    const items = await this.parseBatch([
      { text: `${SINGLE_PROMPT}\n${hint}\n\nText:\n${text}` },
    ]);
    return items[0]!;
  }

  async parseImage(
    base64: string,
    mimeType: string,
    hints: { propertyId?: string; month?: string },
  ): Promise<ParsedExpense> {
    const hint = [hints.propertyId && `property: ${hints.propertyId}`, hints.month && `month: ${hints.month}`]
      .filter(Boolean)
      .join('. ');
    const items = await this.parseBatch([
      { text: `${SINGLE_PROMPT}\n${hint}\n\nExtract from receipt image.` },
      { inline_data: { mime_type: mimeType, data: base64 } },
    ]);
    return items[0]!;
  }

  async parseDocument(
    base64: string,
    mimeType: string,
    fileName?: string,
  ): Promise<ParsedExpense[]> {
    const fileLine = fileName ? `File name: ${fileName}` : '';
    return this.parseBatch([
      { text: `${PROMPT}\n\n${fileLine}\n\nExtract all bills from this document.` },
      { inline_data: { mime_type: mimeType, data: base64 } },
    ]);
  }

  private async parseBatch(
    parts: Array<{ text?: string; inline_data?: { mime_type: string; data: string } }>,
  ): Promise<ParsedExpense[]> {
    const raw = await this.call(parts);
    const json = JSON.parse(raw) as { expenses?: ParsedExpense[] } | ParsedExpense;
    const items = Array.isArray((json as { expenses?: ParsedExpense[] }).expenses)
      ? (json as { expenses: ParsedExpense[] }).expenses
      : [json as ParsedExpense];
    if (items.length === 0) throw new Error('No expenses found');
    return filterPortfolioExpenses(
      items.map((parsed) => {
        if (!Number.isFinite(parsed.amount) || parsed.amount <= 0) {
          throw new Error('Invalid amount from scan');
        }
        if (!parsed.category) parsed.category = 'Other';
        if (!parsed.confidence) {
          parsed.confidence =
            parsed.propertyId && /^\d{4}-\d{2}$/.test(parsed.month) ? 'high' : 'low';
        }
        return parsed;
      }),
    );
  }

  private async call(
    parts: Array<{ text?: string; inline_data?: { mime_type: string; data: string } }>,
  ): Promise<string> {
    const apiKey = this.config.get<string>('GEMINI_API_KEY')?.trim();
    if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
        }),
      },
    );
    if (!res.ok) throw new Error(`Gemini error: ${res.status}`);
    const json = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const raw = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) throw new Error('Empty Gemini response');
    return raw;
  }
}

export type BulkExpenseInput = {
  propertyId: 'ranch' | 'lindon';
  month: string;
  category: string;
  amount: number;
  note?: string;
  vendor?: string;
};

export function buildExpenseFromInput(body: BulkExpenseInput): Expense {
  return {
    id: `exp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    propertyId: body.propertyId,
    month: body.month,
    category: body.category.trim(),
    amount: Number(body.amount),
    note: body.note?.trim() || undefined,
    vendor: body.vendor?.trim() || undefined,
  };
}
