/** Keep vendor patterns in sync with web/src/lib/utility-vendors.ts */

export const ROCKY_MOUNTAIN_POWER = 'Rocky Mountain Power';

const VENDOR_RULES: Array<{
  label: string;
  category: 'Utilities' | 'Other';
  pattern: RegExp;
}> = [
  {
    label: 'Lindon City Utilities',
    category: 'Utilities',
    pattern: /lindon\s*city|city\s*of\s*lindon|lindon\s*utilities/i,
  },
  {
    label: ROCKY_MOUNTAIN_POWER,
    category: 'Utilities',
    pattern: /rocky\s*mountain\s*power|rockymountainpower|\brmp\b/i,
  },
  {
    label: 'Enbridge Gas',
    category: 'Utilities',
    pattern: /enbridge/i,
  },
  {
    label: 'X-Mission Internet',
    category: 'Utilities',
    pattern: /x[\s-]*mission|xmission/i,
  },
  {
    label: 'Hospitable Software',
    category: 'Other',
    pattern: /hospitable/i,
  },
];

const RMP_VENDOR_RE = VENDOR_RULES[1]!.pattern;

export function isRockyMountainPowerBill(...parts: (string | undefined)[]): boolean {
  return RMP_VENDOR_RE.test(parts.filter(Boolean).join(' '));
}

export type VendorNormalizable = {
  vendor?: string;
  note?: string;
  category?: string;
};

export function applyRockyMountainPowerVendor<T extends VendorNormalizable>(
  expense: T,
  context?: { fileName?: string },
): T {
  return applyPortfolioVendorNormalization(expense, context);
}

/** Normalize known utility and software vendors from bill text, notes, or filenames. */
export function applyPortfolioVendorNormalization<T extends VendorNormalizable>(
  expense: T,
  context?: { fileName?: string },
): T {
  const blob = [expense.vendor, expense.note, context?.fileName].filter(Boolean).join(' ');

  for (const rule of VENDOR_RULES) {
    if (!rule.pattern.test(blob)) continue;
    return {
      ...expense,
      vendor: rule.label,
      category:
        rule.label === 'Hospitable Software'
          ? 'Other'
          : !expense.category || expense.category === 'Other'
            ? rule.category
            : expense.category,
    };
  }

  return expense;
}
