/** Client-side portfolio address filter — keep in sync with web/functions/_lib/expense-address.ts */

const EXCLUDED_SERVICE_RE = [/53\s+n(orth)?\.?\s+state/i, /\b53\s+n\.?\s+st\b/i];

const RANCH_SERVICE_RE = [
  /\b270\b[\s,]*(?:e\.?|east)\s*center/i,
  /\b270\s+e(?:ast)?\s+center\s+(?:st|street)\b/i,
  /\b270\s+east\s+center\b/i,
  /ranch\s+house/i,
];

const LINDON_SERVICE_RE = [
  /\b143\b[\s,]*harcliff/i,
  /\bharcliff(?:e)?\s+circle\b/i,
  /\b143\s+harcliff(?:e)?\b/i,
];

function noteBlob(fields: { note?: string; vendor?: string }): string {
  return `${fields.note ?? ''} ${fields.vendor ?? ''}`;
}

export function mentionsExcludedServiceAddress(fields: { note?: string; vendor?: string }): boolean {
  return EXCLUDED_SERVICE_RE.some((re) => re.test(noteBlob(fields)));
}

export function mentionsRanchServiceAddress(fields: { note?: string; vendor?: string }): boolean {
  const blob = noteBlob(fields);
  if (mentionsExcludedServiceAddress(fields) && !RANCH_SERVICE_RE.some((re) => re.test(blob))) {
    return false;
  }
  return RANCH_SERVICE_RE.some((re) => re.test(blob));
}

export function mentionsLindonServiceAddress(fields: { note?: string; vendor?: string }): boolean {
  return LINDON_SERVICE_RE.some((re) => re.test(noteBlob(fields)));
}

export function classifyPortfolioProperty(fields: {
  note?: string;
  vendor?: string;
}): 'ranch' | 'lindon' | null {
  const ranch = mentionsRanchServiceAddress(fields);
  const lindon = mentionsLindonServiceAddress(fields);
  if (ranch && !lindon) return 'ranch';
  if (lindon && !ranch) return 'lindon';
  return null;
}

export function isPortfolioExpense(fields: {
  note?: string;
  vendor?: string;
  propertyId?: string | null;
}): boolean {
  const classified = classifyPortfolioProperty(fields);
  if (!classified) return false;
  if (mentionsExcludedServiceAddress(fields) && !classified) return false;
  if (fields.propertyId === 'ranch' || fields.propertyId === 'lindon') {
    return fields.propertyId === classified;
  }
  return true;
}

export function filterPortfolioExpenses<T extends {
  note?: string;
  vendor?: string;
  propertyId?: string | null;
  confidence?: 'high' | 'low';
}>(expenses: T[]): T[] {
  const out: T[] = [];
  for (const expense of expenses) {
    if (!isPortfolioExpense(expense)) continue;
    const propertyId = classifyPortfolioProperty(expense);
    if (!propertyId) continue;
    out.push({
      ...expense,
      propertyId,
      confidence:
        expense.propertyId && expense.propertyId !== propertyId
          ? 'low'
          : expense.confidence,
    } as T);
  }
  return out;
}
