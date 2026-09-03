/** Infer YYYY-MM for expenses from bills, filenames, and model output. */

const PAID_DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** Calendar paid date (YYYY-MM-DD) for construction carrying-cost tracking. */
export function parsePaidDate(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return PAID_DATE_RE.test(trimmed) ? trimmed : undefined;
}

const YM_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

const MONTH_NAMES: Record<string, string> = {
  january: '01',
  jan: '01',
  february: '02',
  feb: '02',
  march: '03',
  mar: '03',
  april: '04',
  apr: '04',
  may: '05',
  june: '06',
  jun: '06',
  july: '07',
  jul: '07',
  august: '08',
  aug: '08',
  september: '09',
  sep: '09',
  sept: '09',
  october: '10',
  oct: '10',
  november: '11',
  nov: '11',
  december: '12',
  dec: '12',
};

export const MONTH_ASSIGNMENT_PROMPT = `
MONTH assignment (critical — expenses must appear in the correct dashboard month):
- month is YYYY-MM for when this expense belongs in the portfolio (not today's date, not import date).
- Utility/electric bills (e.g. Rocky Mountain Power): use the billing/service period END month, or the due-date month if only due date is shown.
  Examples: "Billing period 01/15/2026 - 02/14/2026" → 2026-02; "Due Date 03/10/2026" → 2026-03; "February 2026" → 2026-02.
- If a service period spans two calendar months, use the END month of the period.
- Credit card / vendor receipts: use the transaction or statement date on the receipt.
- Put the billing period or due date you used in the note (e.g. "Utilities · period ending 02/14/2026").
`.trim();

function toYearMonth(year: number, month: number): string | null {
  if (year < 2000 || year > 2100 || month < 1 || month > 12) return null;
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** Normalize model output like 2026-3 → 2026-03 */
export function normalizeYearMonth(value: string | undefined | null): string | null {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (YM_RE.test(trimmed)) return trimmed;
  const loose = trimmed.match(/^(\d{4})[-/](\d{1,2})$/);
  if (loose) return toYearMonth(Number(loose[1]), Number(loose[2]));
  return null;
}

/** Parse YYYY-MM from free text (note, OCR, filenames). */
export function parseYearMonthFromText(text: string): string | null {
  if (!text) return null;

  const iso = text.match(/\b(20\d{2})-(0[1-9]|1[0-2])\b/);
  if (iso) return `${iso[1]}-${iso[2]}`;

  const ymd = text.match(/\b(0?[1-9]|1[0-2])[/.-](0?[1-9]|[12]\d|3[01])[/.-](20\d{2})\b/);
  if (ymd) return toYearMonth(Number(ymd[3]), Number(ymd[1]));

  const dmy = text.match(/\b(0?[1-9]|[12]\d|3[01])[/.-](0?[1-9]|1[0-2])[/.-](20\d{2})\b/);
  if (dmy) return toYearMonth(Number(dmy[3]), Number(dmy[2]));

  const named = text.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\b[\s,.-]*?(20\d{2})\b/i,
  );
  if (named) {
    const m = MONTH_NAMES[named[1]!.toLowerCase()];
    if (m) return `${named[2]}-${m}`;
  }

  const namedRev = text.match(
    /\b(20\d{2})\b[\s,.-]*?\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\b/i,
  );
  if (namedRev) {
    const m = MONTH_NAMES[namedRev[2]!.toLowerCase()];
    if (m) return `${namedRev[1]}-${m}`;
  }

  const compact = text.match(/\b(20\d{2})(0[1-9]|1[0-2])\b/);
  if (compact) return `${compact[1]}-${compact[2]}`;

  return null;
}

export function parseYearMonthFromFileName(fileName?: string): string | null {
  if (!fileName) return null;
  return parseYearMonthFromText(fileName.replace(/\.[a-z0-9]+$/i, ' '));
}

export type MonthInferenceContext = {
  fileName?: string;
  /** Dashboard month — only used as last resort when bill has no date */
  fallbackMonth?: string;
};

/**
 * Resolve expense month: model output → note text → filename → optional fallback.
 */
export function resolveExpenseMonth(
  rawMonth: string | undefined | null,
  note: string | undefined,
  context: MonthInferenceContext = {},
): { month: string; confidencePenalty: boolean } {
  const fromModel = normalizeYearMonth(rawMonth);
  if (fromModel) return { month: fromModel, confidencePenalty: false };

  const fromNote = parseYearMonthFromText(note ?? '');
  if (fromNote) return { month: fromNote, confidencePenalty: false };

  const fromFile = parseYearMonthFromFileName(context.fileName);
  if (fromFile) return { month: fromFile, confidencePenalty: true };

  const fromFallback = normalizeYearMonth(context.fallbackMonth);
  if (fromFallback) return { month: fromFallback, confidencePenalty: true };

  const now = new Date();
  return {
    month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
    confidencePenalty: true,
  };
}
