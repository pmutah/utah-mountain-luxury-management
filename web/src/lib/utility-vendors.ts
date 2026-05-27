/** Portfolio utility / recurring vendor names — keep in sync with web/functions/_lib/expense-vendors.ts */

export type UtilityVendorId =
  | 'lindon-city'
  | 'rocky-mountain-power'
  | 'enbridge-gas'
  | 'xmission-internet'
  | 'hospitable';

export type UtilityVendorDef = {
  id: UtilityVendorId;
  label: string;
  category: 'Utilities' | 'Other';
  pattern: RegExp;
};

export const PORTFOLIO_UTILITY_VENDORS: UtilityVendorDef[] = [
  {
    id: 'lindon-city',
    label: 'Lindon City Utilities',
    category: 'Utilities',
    pattern: /lindon\s*city|city\s*of\s*lindon|lindon\s*utilities/i,
  },
  {
    id: 'rocky-mountain-power',
    label: 'Rocky Mountain Power',
    category: 'Utilities',
    pattern: /rocky\s*mountain\s*power|rockymountainpower|\brmp\b/i,
  },
  {
    id: 'enbridge-gas',
    label: 'Enbridge Gas',
    category: 'Utilities',
    pattern: /enbridge/i,
  },
  {
    id: 'xmission-internet',
    label: 'X-Mission Internet',
    category: 'Utilities',
    pattern: /x[\s-]*mission|xmission/i,
  },
  {
    id: 'hospitable',
    label: 'Hospitable Software',
    category: 'Other',
    pattern: /hospitable/i,
  },
];

export const PORTFOLIO_UTILITY_VENDOR_ORDER: UtilityVendorId[] = PORTFOLIO_UTILITY_VENDORS.map(
  (v) => v.id,
);

export function vendorBlob(vendor?: string, note?: string): string {
  return `${vendor ?? ''} ${note ?? ''}`.trim();
}

export function classifyUtilityVendor(fields: {
  vendor?: string;
  note?: string;
  category?: string;
}): UtilityVendorId | null {
  const blob = vendorBlob(fields.vendor, fields.note);
  for (const def of PORTFOLIO_UTILITY_VENDORS) {
    if (def.pattern.test(blob)) return def.id;
  }
  if (fields.category === 'Utilities' && fields.vendor?.trim()) {
    const lower = fields.vendor.toLowerCase();
    const known = PORTFOLIO_UTILITY_VENDORS.some((d) => d.label.toLowerCase() === lower);
    if (!known) return null;
  }
  return null;
}

export function utilityVendorLabel(id: UtilityVendorId): string {
  return PORTFOLIO_UTILITY_VENDORS.find((v) => v.id === id)?.label ?? id;
}

export type VendorNormalizable = {
  vendor?: string;
  note?: string;
  category?: string;
};

/** Normalize vendor name and category for known portfolio utilities (client + imports). */
export function applyPortfolioVendorNormalization<T extends VendorNormalizable>(
  expense: T,
  context?: { fileName?: string },
): T {
  const blob = [expense.vendor, expense.note, context?.fileName].filter(Boolean).join(' ');
  for (const def of PORTFOLIO_UTILITY_VENDORS) {
    if (!def.pattern.test(blob)) continue;
    return {
      ...expense,
      vendor: def.label,
      category:
        def.id === 'hospitable'
          ? 'Other'
          : !expense.category || expense.category === 'Other'
            ? def.category
            : expense.category,
    };
  }
  return expense;
}
