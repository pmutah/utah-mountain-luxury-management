import type { Expense } from './api';
import { mapCategoryToScheduleELine, SCHEDULE_E_LINES } from './tax-prep';

/**
 * Client-Side Bank & Credit Card CSV Statement Reconciler.
 *
 * Parses pasted CSV / TSV lines (Chase, Amex, Wells Fargo, Robinhood, Capital One, etc.) strictly in
 * browser memory and reconciles each debit row one-to-one against logged `expenses` so repeated charges
 * of the same dollar amount never double-claim a single receipt on the books.
 *
 * Never sends bank data over the network and never mutates KV.
 */

export type ParsedStatementLine = {
  rowIndex: number;
  dateIso: string; // YYYY-MM-DD
  month: string; // YYYY-MM
  description: string;
  amount: number; // positive debit USD
};

export type ReconciledRow = {
  line: ParsedStatementLine;
  status: 'matched' | 'missing';
  matchedExpense?: {
    id: string;
    propertyId: string;
    category: string;
    vendor: string;
    amount: number;
    hasReceipt: boolean;
  };
  suggestedCategory: string;
  suggestedScheduleELine: string;
};

export type ReconciliationSummary = {
  parsedCount: number;
  skippedCount: number;
  matchedCount: number;
  missingCount: number;
  matchedTotalUsd: number;
  missingTotalUsd: number;
  rows: ReconciledRow[];
};

function splitDelimitedLine(raw: string, delimiter: ',' | '\t'): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i]!;
    if (ch === '"') {
      if (inQuotes && raw[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === delimiter && !inQuotes) {
      out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

export function normalizeStatementDate(raw: string): string | null {
  const cleaned = raw.trim().replace(/^["']|["']$/g, '');
  // YYYY-MM-DD or YYYY/MM/DD
  const iso = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(cleaned);
  if (iso) {
    const y = Number(iso[1]);
    const m = Number(iso[2]);
    const d = Number(iso[3]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }
  // MM/DD/YYYY or MM/DD/YY
  const us = /^(\d{1,2})[-/](\d{1,2})[-/](\d{2}|\d{4})$/.exec(cleaned);
  if (us) {
    const m = Number(us[1]);
    const d = Number(us[2]);
    let y = Number(us[3]);
    if (y < 100) y += 2000;
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }
  return null;
}

function parseAmountToken(raw: string): number | null {
  const cleaned = raw.trim().replace(/[$,\s]/g, '');
  if (!cleaned) return null;
  // Accounting parens e.g. (145.20) -> -145.20
  const paren = /^\(([\d.]+)\)$/.exec(cleaned);
  const num = paren ? -Number(paren[1]) : Number(cleaned);
  return Number.isFinite(num) ? Math.round(num * 100) / 100 : null;
}

export function inferExpenseCategoryFromMerchant(description: string): string {
  const d = description.toLowerCase();
  if (/rocky mountain power|dominion|enbridge|questar|lindon city|provo city|utopia|xfinity|comcast|starlink|century\s*link|republic services|waste/.test(d)) {
    return 'Utilities';
  }
  if (/april jenson|clean|laundry|linen|hot tub|pool|chem|pest|lawn|snow|plow/.test(d)) {
    return 'Cleaning';
  }
  if (/home depot|lowe'?s|ace hardware|plumb|hvac|electric|handyman|repair|glass|appliance/.test(d)) {
    return 'Repairs';
  }
  if (/costco|sam'?s club|harmons|smith'?s|target|walmart|amazon|coffee|paper|towel|soap/.test(d)) {
    return 'Supplies';
  }
  if (/state farm|allstate|farmers|proper|insur|liberty mutual|travelers/.test(d)) {
    return 'Insurance';
  }
  if (/utah county|property tax|treasurer/.test(d)) {
    return 'Property Tax';
  }
  if (/campbell|cpa|legal|attorney|filing/.test(d)) {
    return 'Legal & Professional';
  }
  return 'Other';
}

export function parseStatementText(rawText: string): {
  lines: ParsedStatementLine[];
  skipped: number;
} {
  const rows = rawText
    .split(/\r?\n/)
    .map((r) => r.trim())
    .filter(Boolean);
  if (rows.length === 0) return { lines: [], skipped: 0 };

  const delimiter: ',' | '\t' = rows[0]!.includes('\t') ? '\t' : ',';
  const parsedRows = rows.map((r) => splitDelimitedLine(r, delimiter));

  // Detect if negative numbers are charges (Chase Credit Card style) vs positive numbers (Amex / Debit CSV)
  const rawAmounts: number[] = [];
  for (const cols of parsedRows) {
    if (cols.length < 2) continue;
    const hasDate = cols.some((c) => normalizeStatementDate(c) !== null);
    if (!hasDate) continue;
    for (let i = cols.length - 1; i >= 1; i -= 1) {
      const val = parseAmountToken(cols[i]!);
      if (val !== null && val !== 0) {
        rawAmounts.push(val);
        break;
      }
    }
  }
  const negCount = rawAmounts.filter((n) => n < 0).length;
  const posCount = rawAmounts.filter((n) => n > 0).length;
  const negativeMeansCharge = negCount > posCount;

  const lines: ParsedStatementLine[] = [];
  let skipped = 0;

  parsedRows.forEach((cols, idx) => {
    if (cols.length < 2) {
      skipped += 1;
      return;
    }

    let dateIso: string | null = null;
    let dateCol = -1;
    for (let c = 0; c < Math.min(3, cols.length); c += 1) {
      const candidate = normalizeStatementDate(cols[c]!);
      if (candidate) {
        dateIso = candidate;
        dateCol = c;
        break;
      }
    }
    if (!dateIso) {
      skipped += 1; // Header row or summary line
      return;
    }

    // Find amount from rightmost numeric column
    let amountRaw: number | null = null;
    let amountCol = -1;
    for (let c = cols.length - 1; c > dateCol; c -= 1) {
      const candidate = parseAmountToken(cols[c]!);
      if (candidate !== null) {
        amountRaw = candidate;
        amountCol = c;
        break;
      }
    }
    if (amountRaw === null || amountRaw === 0) {
      skipped += 1;
      return;
    }

    // Description is the longest non-date text column between dateCol and amountCol (or remaining columns)
    const descCandidates = cols
      .filter((_, c) => c !== dateCol && c !== amountCol && normalizeStatementDate(cols[c]!) === null)
      .filter((text) => text.length > 0 && parseAmountToken(text) === null);
    const description = (descCandidates.sort((a, b) => b.length - a.length)[0] ?? cols[dateCol + 1] ?? 'Statement charge').trim();

    // Skip credit-card autopay / payment thank-you lines
    if (/payment thank you|autopay|online payment|mobile pymt|credit card payment/i.test(description)) {
      skipped += 1;
      return;
    }

    const chargeUsd = negativeMeansCharge ? -amountRaw : amountRaw;
    if (chargeUsd <= 0) {
      skipped += 1;
      return;
    }

    lines.push({
      rowIndex: idx + 1,
      dateIso,
      month: dateIso.slice(0, 7),
      description,
      amount: Math.round(chargeUsd * 100) / 100,
    });
  });

  return { lines, skipped };
}

function monthDistance(ymA: string, ymB: string): number {
  const [yA, mA] = ymA.split('-').map(Number);
  const [yB, mB] = ymB.split('-').map(Number);
  if (!yA || !mA || !yB || !mB) return 99;
  return Math.abs(yA * 12 + mA - (yB * 12 + mB));
}

function vendorOverlapScore(desc: string, exp: Expense): number {
  const hay = desc.toLowerCase();
  const target = `${exp.vendor ?? ''} ${exp.category} ${exp.note ?? ''}`.toLowerCase();
  const words = target.split(/[^a-z0-9]+/).filter((w) => w.length >= 4);
  let hits = 0;
  for (const w of words) {
    if (hay.includes(w)) hits += 1;
  }
  return hits;
}

export function reconcileStatementAgainstExpenses(
  rawText: string,
  expenses: readonly Expense[],
): ReconciliationSummary {
  const { lines, skipped } = parseStatementText(rawText);
  const usedExpenseIds = new Set<string>();

  const rows: ReconciledRow[] = lines.map((line) => {
    let bestExp: Expense | null = null;
    let bestScore = -1;

    for (const exp of expenses) {
      if (usedExpenseIds.has(exp.id)) continue;
      if (Math.abs(exp.amount - line.amount) > 0.05) continue;

      const mDist = monthDistance(line.month, exp.month);
      if (mDist > 1) continue;

      let score = mDist === 0 ? 10 : 5;
      if (exp.paidDate === line.dateIso) score += 8;
      score += vendorOverlapScore(line.description, exp) * 3;

      if (score > bestScore) {
        bestScore = score;
        bestExp = exp;
      }
    }

    const suggestedCategory = inferExpenseCategoryFromMerchant(line.description);
    const schKey = mapCategoryToScheduleELine(suggestedCategory);
    const schMeta = SCHEDULE_E_LINES.find((m) => m.key === schKey);

    if (bestExp) {
      usedExpenseIds.add(bestExp.id);
      return {
        line,
        status: 'matched',
        matchedExpense: {
          id: bestExp.id,
          propertyId: bestExp.propertyId,
          category: bestExp.category,
          vendor: bestExp.vendor || bestExp.category,
          amount: bestExp.amount,
          hasReceipt: Boolean(bestExp.receiptStoragePath || bestExp.receiptUrl),
        },
        suggestedCategory: bestExp.category,
        suggestedScheduleELine: schMeta?.irsLine ?? 'Line 19',
      };
    }

    return {
      line,
      status: 'missing',
      suggestedCategory,
      suggestedScheduleELine: schMeta?.irsLine ?? 'Line 19',
    };
  });

  const matchedRows = rows.filter((r) => r.status === 'matched');
  const missingRows = rows.filter((r) => r.status === 'missing');

  const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

  return {
    parsedCount: lines.length,
    skippedCount: skipped,
    matchedCount: matchedRows.length,
    missingCount: missingRows.length,
    matchedTotalUsd: round2(matchedRows.reduce((s, r) => s + r.line.amount, 0)),
    missingTotalUsd: round2(missingRows.reduce((s, r) => s + r.line.amount, 0)),
    rows,
  };
}

export function missingRowsToCsv(summary: ReconciliationSummary): string {
  const header = 'Date,Merchant / Description,Amount USD,Suggested Category,Suggested Schedule E Line';
  const body = summary.rows
    .filter((r) => r.status === 'missing')
    .map((r) => {
      const desc = `"${r.line.description.replace(/"/g, '""')}"`;
      return `${r.line.dateIso},${desc},${r.line.amount.toFixed(2)},${r.suggestedCategory},${r.suggestedScheduleELine}`;
    });
  return [header, ...body].join('\n');
}
