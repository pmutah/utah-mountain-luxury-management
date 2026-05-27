/** Address rules for Gemini expense extraction (shared prompt fragment). */

export const ADDRESS_RULES_PROMPT = `
Portfolio service addresses (ONLY these count):
- ranch / The Ranch House: 270 East Center Street, Lindon, Utah 84042 (also "270 E Center", "270 East Center St")
- lindon / The Lindon House: 143 Harcliff Circle, Lindon, Utah 84042

Multi-address utility bills (CRITICAL):
- One PDF may list several service locations with separate charges (e.g. 270 East Center Street AND 53 North State Street).
- Extract ONLY the charge amount tied to a portfolio address above — the per-address subtotal, not the account grand total.
- NEVER extract amounts for 53 North State Street or any non-portfolio address.
- If only non-portfolio addresses appear, return an empty expenses array.
- Put the matched service address in the note field (e.g. "Utilities — 270 East Center Street").
`.trim();

const EXCLUDED_ADDRESS_RE = /53\s+n(orth)?\.?\s+state/i;

export function matchesExcludedServiceAddress(fields: {
  note?: string;
  vendor?: string;
}): boolean {
  const blob = `${fields.note ?? ''} ${fields.vendor ?? ''}`;
  return EXCLUDED_ADDRESS_RE.test(blob);
}

export function filterPortfolioExpenses<T extends { note?: string; vendor?: string }>(
  expenses: T[],
): T[] {
  return expenses.filter((e) => !matchesExcludedServiceAddress(e));
}
