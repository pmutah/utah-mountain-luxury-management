import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Expense } from '../common/metrics';

const PROMPT = `You extract vacation-rental expenses for Wilhite Property Management.
Properties: ranch (The Ranch House, 270 E Center St), lindon (The Lindon House, 1011 E 100 N).
Categories: Maintenance, Supplies, Utilities, Cleaning, Insurance, HOA, Landscaping, Other
Return ONLY JSON: {"amount": number, "category": string, "month": "YYYY-MM", "propertyId": "ranch"|"lindon"|null, "vendor": string, "note": string}`;

export interface ParsedExpense {
  amount: number;
  category: string;
  month: string;
  propertyId: 'ranch' | 'lindon' | null;
  vendor?: string;
  note?: string;
}

@Injectable()
export class GeminiExpenseParser {
  constructor(private readonly config: ConfigService) {}

  async parseText(text: string, hints: { propertyId?: string; month?: string }): Promise<ParsedExpense> {
    const hint = [hints.propertyId && `property: ${hints.propertyId}`, hints.month && `month: ${hints.month}`]
      .filter(Boolean)
      .join('. ');
    return this.call([{ text: `${PROMPT}\n${hint}\n\nText:\n${text}` }]);
  }

  async parseImage(
    base64: string,
    mimeType: string,
    hints: { propertyId?: string; month?: string },
  ): Promise<ParsedExpense> {
    const hint = [hints.propertyId && `property: ${hints.propertyId}`, hints.month && `month: ${hints.month}`]
      .filter(Boolean)
      .join('. ');
    return this.call([
      { text: `${PROMPT}\n${hint}\n\nExtract from receipt image.` },
      { inline_data: { mime_type: mimeType, data: base64 } },
    ]);
  }

  private async call(
    parts: Array<{ text?: string; inline_data?: { mime_type: string; data: string } }>,
  ): Promise<ParsedExpense> {
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
    const parsed = JSON.parse(raw) as ParsedExpense;
    if (!Number.isFinite(parsed.amount) || parsed.amount <= 0) {
      throw new Error('Invalid amount from scan');
    }
    return parsed;
  }
}
