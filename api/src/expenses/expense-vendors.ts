export const ROCKY_MOUNTAIN_POWER = 'Rocky Mountain Power';

const RMP_VENDOR_RE = /rocky\s*mountain\s*power|rockymountainpower|\brmp\b/i;

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
  const blob = [expense.vendor, expense.note, context?.fileName].filter(Boolean).join(' ');
  const isRmp =
    isRockyMountainPowerBill(blob) ||
    (expense.category === 'Utilities' && !expense.vendor && context?.fileName);

  if (!isRmp) return expense;

  return {
    ...expense,
    vendor: ROCKY_MOUNTAIN_POWER,
    category:
      !expense.category || expense.category === 'Other' ? 'Utilities' : expense.category,
  };
}
