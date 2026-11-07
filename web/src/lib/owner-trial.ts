export type OwnerTrial = {
  feeCents: number;
  toddCents: number;
  partnerCents: number;
  line: string;
};

function money(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100).toLocaleString('en-US');
  const rest = String(abs % 100).padStart(2, '0');
  return `${sign}$${dollars}.${rest}`;
}

function wholeDollars(raw: string): number | null {
  const trimmed = raw.trim().replace(/[$,]/g, '');
  if (trimmed === '') return 0;
  if (!/^-?\d{1,7}$/.test(trimmed)) return null;
  return Number(trimmed);
}

/** Ranch and River amounts added before one fee. Lindon is not part of the sum. */
export function ownerTrialHouses(ranchRaw: string, riverRaw: string): OwnerTrial | null {
  if (ranchRaw.trim() === '' && riverRaw.trim() === '') return null;
  const ranch = wholeDollars(ranchRaw);
  const river = wholeDollars(riverRaw);
  if (ranch === null || river === null) return null;
  const sum = ranch + river;
  if (!Number.isSafeInteger(sum) || Math.abs(sum) > 9_999_999) return null;
  const trial = ownerTrial(String(sum));
  if (!trial) return null;
  const line = `Ranch and River are added before the fee. ${trial.line}`;
  if (/lindon|household|construction|statement/i.test(line)) return null;
  return { ...trial, line };
}

/** A typed amount before the fee. It does not read saved bookings. */
export function ownerTrial(raw: string): OwnerTrial | null {
  const trimmed = raw.trim().replace(/[$,]/g, '');
  if (!/^-?\d{1,7}$/.test(trimmed)) return null;
  const dollars = Number(trimmed);
  const cents = dollars * 100;
  const feeCents = cents > 0 ? dollars * 20 : 0;
  const remains = cents - feeCents;
  const toddCents = remains / 2;
  const partnerCents = remains - toddCents;
  const tail = 'This trial does not read saved bookings. Nothing was written over them.';
  const line =
    cents < 0
      ? `A loss after the fee splits in half. The fee is ${money(feeCents)}. Todd’s half is ${money(toddCents)}. Brandon and Stephanie’s half is ${money(partnerCents)}. ${tail}`
      : cents === 0
        ? `There is no fee and no half on zero. ${tail}`
        : `The management fee is ${money(feeCents)}. What remains splits in half. Todd’s half is ${money(toddCents)}. Brandon and Stephanie’s half is ${money(partnerCents)}. ${tail}`;
  if (line.includes('statement') || /lindon|household|construction/i.test(line)) return null;
  return { feeCents, toddCents, partnerCents, line };
}
