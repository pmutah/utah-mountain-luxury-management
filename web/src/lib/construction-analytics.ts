import type { Expense } from './api';
import { CONSTRUCTION_STAGES } from './construction-stages';
import { PAID_BY_LABELS } from './paid-by';
import { paidDateFromExpense } from './paid-date';

export type ConstructionPhaseRow = {
  stage: string;
  totalUsd: number;
  brandonUsd: number;
  toddUsd: number;
  count: number;
  documentedCount: number;
  documentedUsd: number;
  receiptPct: number;
  macrsHint: string;
};

const STAGE_MACRS_HINTS: Record<string, string> = {
  Planning: 'Capitalized Soft Costs (39-yr basis)',
  Permits: 'Capitalized Soft Costs (39-yr basis)',
  'Site / Foundation': '15-yr Site/Land Imp. + 39-yr Foundation',
  Framing: '39-yr Structural Building',
  'Rough MEP': '39-yr Core MEP + 5-yr Specialty Circuits',
  'Insulation / Dry-in': '39-yr Building Envelope',
  Drywall: '39-yr Interior Structure',
  Finishes: 'Mixed 5-yr / 7-yr Millwork & Flooring + 39-yr',
  Furnishings: '5-yr / 7-yr Personal Property (Bonus-eligible)',
  Punch: 'Mixed 5-yr / 15-yr / 39-yr Completion',
  'Certificate of Occupancy': 'Capitalized Closing / CO Basis',
  Untagged: 'Assign phase for CPA cost-segregation',
};

function cents(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function macrsHintForStage(stage: string | undefined): string {
  const key = (stage ?? '').trim() || 'Untagged';
  return STAGE_MACRS_HINTS[key] ?? 'Mixed 5-yr / 15-yr / 39-yr Basis';
}

export function summarizeConstructionPhases(expenses: readonly Expense[]): {
  phases: ConstructionPhaseRow[];
  totalUsd: number;
  documentedUsd: number;
  overallReceiptPct: number;
  acceleratedCandidateUsd: number;
} {
  const buckets = new Map<string, ConstructionPhaseRow>();
  for (const stage of [...CONSTRUCTION_STAGES, 'Untagged']) {
    buckets.set(stage, {
      stage,
      totalUsd: 0,
      brandonUsd: 0,
      toddUsd: 0,
      count: 0,
      documentedCount: 0,
      documentedUsd: 0,
      receiptPct: 100,
      macrsHint: macrsHintForStage(stage),
    });
  }

  let totalUsd = 0;
  let documentedUsd = 0;
  let acceleratedCandidateUsd = 0;

  for (const exp of expenses) {
    if (exp.propertyId !== 'construction') continue;
    const amt = Number(exp.amount) || 0;
    if (amt <= 0) continue;

    const stageName = (exp.stage ?? '').trim() || 'Untagged';
    if (!buckets.has(stageName)) {
      buckets.set(stageName, {
        stage: stageName,
        totalUsd: 0,
        brandonUsd: 0,
        toddUsd: 0,
        count: 0,
        documentedCount: 0,
        documentedUsd: 0,
        receiptPct: 100,
        macrsHint: macrsHintForStage(stageName),
      });
    }

    const row = buckets.get(stageName)!;
    const hasReceipt = Boolean(exp.receiptStoragePath || exp.receiptUrl);

    row.totalUsd = cents(row.totalUsd + amt);
    row.count += 1;
    if (exp.paidBy === 'todd') row.toddUsd = cents(row.toddUsd + amt);
    else row.brandonUsd = cents(row.brandonUsd + amt);

    if (hasReceipt) {
      row.documentedCount += 1;
      row.documentedUsd = cents(row.documentedUsd + amt);
      documentedUsd = cents(documentedUsd + amt);
    }

    totalUsd = cents(totalUsd + amt);
    if (stageName === 'Furnishings' || stageName === 'Finishes' || stageName === 'Site / Foundation') {
      acceleratedCandidateUsd = cents(acceleratedCandidateUsd + amt);
    }
  }

  const phases = [...buckets.values()]
    .filter((row) => row.count > 0)
    .map((row) => ({
      ...row,
      receiptPct: row.totalUsd > 0 ? Math.round((row.documentedUsd / row.totalUsd) * 100) : 100,
    }))
    .sort((a, b) => b.totalUsd - a.totalUsd);

  return {
    phases,
    totalUsd,
    documentedUsd,
    overallReceiptPct: totalUsd > 0 ? Math.round((documentedUsd / totalUsd) * 100) : 100,
    acceleratedCandidateUsd,
  };
}

function csvCell(value: string | number): string {
  const text = String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function constructionBasisCsv(expenses: readonly Expense[]): string {
  const rows = expenses
    .filter((e) => e.propertyId === 'construction' && (Number(e.amount) || 0) > 0)
    .sort((a, b) => {
      const da = paidDateFromExpense(a) || a.month || '';
      const db = paidDateFromExpense(b) || b.month || '';
      return da.localeCompare(db);
    });

  const lines: string[] = [
    'Utah Mountain Luxury — River House Construction Capital Basis & Partner Ledger',
    'Note,Construction partner spend only (excluded from rental Schedule E P&L).',
    '',
    'Paid Date,Month,Stage,Paid By,Description,Vendor,Amount USD,MACRS Cost-Seg Hint,Receipt Attached',
  ];

  for (const exp of rows) {
    const date = paidDateFromExpense(exp) || exp.createdAt?.slice(0, 10) || exp.month;
    const stage = (exp.stage ?? '').trim() || 'Untagged';
    const who = exp.paidBy ? PAID_BY_LABELS[exp.paidBy] : 'Brandon & Stephanie';
    const hasReceipt = Boolean(exp.receiptStoragePath || exp.receiptUrl) ? 'YES' : 'NO';
    lines.push(
      [
        csvCell(date),
        csvCell(exp.month),
        csvCell(stage),
        csvCell(who),
        csvCell(exp.note ?? exp.category),
        csvCell(exp.vendor ?? ''),
        exp.amount.toFixed(2),
        csvCell(macrsHintForStage(stage)),
        hasReceipt,
      ].join(','),
    );
  }

  return lines.join('\n');
}
