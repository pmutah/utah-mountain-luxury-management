/** Keep in sync with web/functions/_lib/expense-address.ts */

export const PORTFOLIO_ADDRESSES = {
  ranch: '270 East Center Street, Lindon, Utah 84042',
  lindon: '143 Harcliff Circle, Lindon, Utah 84042',
} as const;

export const ADDRESS_RULES_PROMPT = `
Portfolio service addresses — ONLY these two locations may produce expenses:
- ranch / The Ranch House: ${PORTFOLIO_ADDRESSES.ranch} (also "270 E Center", "270 East Center St")
- lindon / The Lindon House: ${PORTFOLIO_ADDRESSES.lindon} (also "143 Harcliff", "Harcliffe Circle")

Multi-address utility bills (CRITICAL):
- One PDF may list several service locations (e.g. 270 East Center Street AND 53 North State Street).
- Emit ONE expense object per portfolio address that appears on the bill — at most TWO expenses per PDF.
- Each expense amount must be the per-address subtotal for that portfolio street only, NEVER the account grand total.
- Do NOT emit any expense for 53 North State Street or any other address.
- If the bill has only non-portfolio addresses, return {"expenses":[]}.
- Every expense note MUST include the exact portfolio service street used.
- propertyId must be "ranch" for 270 East Center only, "lindon" for 143 Harcliff only.
`.trim();

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

export type PortfolioPropertyId = 'ranch' | 'lindon';

function noteBlob(fields: { note?: string; vendor?: string }): string {
  return `${fields.note ?? ''} ${fields.vendor ?? ''}`;
}

export function mentionsExcludedServiceAddress(fields: { note?: string; vendor?: string }): boolean {
  const blob = noteBlob(fields);
  return EXCLUDED_SERVICE_RE.some((re) => re.test(blob));
}

export function mentionsRanchServiceAddress(fields: { note?: string; vendor?: string }): boolean {
  if (mentionsExcludedServiceAddress(fields) && !RANCH_SERVICE_RE.some((re) => re.test(noteBlob(fields)))) {
    return false;
  }
  return RANCH_SERVICE_RE.some((re) => re.test(noteBlob(fields)));
}

export function mentionsLindonServiceAddress(fields: { note?: string; vendor?: string }): boolean {
  return LINDON_SERVICE_RE.some((re) => re.test(noteBlob(fields)));
}

export function classifyPortfolioProperty(fields: {
  note?: string;
  vendor?: string;
}): PortfolioPropertyId | null {
  const ranch = mentionsRanchServiceAddress(fields);
  const lindon = mentionsLindonServiceAddress(fields);
  if (ranch && !lindon) return 'ranch';
  if (lindon && !ranch) return 'lindon';
  return null;
}

export type AddressableExpense = {
  note?: string;
  vendor?: string;
  propertyId?: 'ranch' | 'lindon' | string | null;
  confidence?: 'high' | 'low';
};

export function isPortfolioExpense(fields: {
  note?: string;
  vendor?: string;
  propertyId?: string | null;
}): boolean {
  if (mentionsExcludedServiceAddress(fields) && !classifyPortfolioProperty(fields)) {
    return false;
  }
  const classified = classifyPortfolioProperty(fields);
  if (!classified) return false;
  if (fields.propertyId && fields.propertyId !== 'ranch' && fields.propertyId !== 'lindon') {
    return false;
  }
  if (fields.propertyId === 'ranch' || fields.propertyId === 'lindon') {
    return fields.propertyId === classified;
  }
  return true;
}

export function filterPortfolioExpenses<T extends AddressableExpense>(expenses: T[]): T[] {
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
    });
  }
  return out;
}
