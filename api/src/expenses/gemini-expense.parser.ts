import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Expense } from '../common/metrics';
import { ADDRESS_RULES_PROMPT, filterPortfolioExpenses } from './expense-address';
import {
  MONTH_ASSIGNMENT_PROMPT,
  resolveExpenseMonth,
  type MonthInferenceContext,
} from './expense-month';
import { applyRockyMountainPowerVendor } from './expense-vendors';
import { generateGeminiJson, type GeminiPart } from './gemini-call';

const PROMPT = `You extract vacation-rental expenses for Utah Mountain Luxury Management.
${ADDRESS_RULES_PROMPT}
${MONTH_ASSIGNMENT_PROMPT}
Categories: Maintenance, Supplies, Utilities, Cleaning, Insurance, HOA, Landscaping, Other
Return ONLY JSON: {"expenses":[{"amount":number,"category":string,"month":"YYYY-MM","propertyId":"ranch"|"lindon"|null,"vendor":string,"note":string,"confidence":"high"|"low"}]}
Rules: one or many bills per document at portfolio addresses only; per-address amount not account total; month from billing/statement period not import date; confidence low if property or month ambiguous; note must include service address; vendor exact names: "Lindon City Utilities", "Rocky Mountain Power", "Enbridge Gas", "X-Mission Internet", "Hospitable Software" when applicable.`;

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
    const hint = [
      hints.propertyId && `property: ${hints.propertyId}`,
      hints.month &&
        `If the document has no billing or statement date, you may use ${hints.month} as month (last resort only).`,
    ]
      .filter(Boolean)
      .join('. ');
    const items = await this.parseBatch(
      [{ text: `${SINGLE_PROMPT}\n${hint}\n\nText:\n${text}` }],
      { fallbackMonth: hints.month },
    );
    return items[0]!;
  }

  async parseImage(
    base64: string,
    mimeType: string,
    hints: { propertyId?: string; month?: string },
  ): Promise<ParsedExpense> {
    const hint = [
      hints.propertyId && `property: ${hints.propertyId}`,
      hints.month &&
        `If the document has no billing or statement date, you may use ${hints.month} as month (last resort only).`,
    ]
      .filter(Boolean)
      .join('. ');
    const items = await this.parseBatch(
      [
        { text: `${SINGLE_PROMPT}\n${hint}\n\nExtract from receipt image.` },
        { inline_data: { mime_type: mimeType, data: base64 } },
      ],
      { fallbackMonth: hints.month },
    );
    return items[0]!;
  }

  async parseDocument(
    base64: string,
    mimeType: string,
    fileName?: string,
  ): Promise<ParsedExpense[]> {
    const fileLine = fileName ? `File name: ${fileName}` : '';
    return this.parseBatch(
      [
        { text: `${PROMPT}\n\n${fileLine}\n\nExtract all bills from this document.` },
        { inline_data: { mime_type: mimeType, data: base64 } },
      ],
      { fileName },
    );
  }

  private async parseBatch(
    parts: Array<{ text?: string; inline_data?: { mime_type: string; data: string } }>,
    context: MonthInferenceContext = {},
  ): Promise<ParsedExpense[]> {
    const raw = await this.call(parts);
    const json = JSON.parse(raw) as { expenses?: ParsedExpense[] } | ParsedExpense;
    const items = Array.isArray((json as { expenses?: ParsedExpense[] }).expenses)
      ? (json as { expenses: ParsedExpense[] }).expenses
      : [json as ParsedExpense];
    if (items.length === 0) throw new Error('No expenses found');
    return filterPortfolioExpenses(
      items.map((parsed) => this.normalizeExpense(parsed, context)),
    );
  }

  private normalizeExpense(raw: ParsedExpense, context: MonthInferenceContext): ParsedExpense {
    const parsed = { ...raw };
    if (!Number.isFinite(parsed.amount) || parsed.amount <= 0) {
      throw new Error('Invalid amount from scan');
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
      parsed.confidence = parsed.propertyId && !confidencePenalty ? 'high' : 'low';
    }
    return applyRockyMountainPowerVendor(parsed, { fileName: context.fileName });
  }

  private async call(parts: GeminiPart[]): Promise<string> {
    const apiKey = this.config.get<string>('GEMINI_API_KEY')?.trim();
    if (!apiKey) throw new Error('GEMINI_API_KEY not configured');
    return generateGeminiJson(apiKey, parts);
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
