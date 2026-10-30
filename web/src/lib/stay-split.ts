export type StaySplit = {
  guests: number;
  highCents: number;
  highCount: number;
  lowCents: number;
  lowCount: number;
};

function people(count: number): string {
  return count === 1 ? '1 overnight guest' : `${count} overnight guests`;
}

function money(cents: number): string {
  const digits = cents % 100 === 0 ? 0 : 2;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(cents / 100);
}

/** Split a direct stay total across the party. Leftover pennies sit on the first shares. */
export function splitStay(totalDollars: number, guests: number): StaySplit | null {
  if (!Number.isInteger(guests) || guests < 2) return null;
  if (!Number.isFinite(totalDollars) || totalDollars < 0) return null;
  const cents = Math.round(totalDollars * 100);
  const lowCents = Math.floor(cents / guests);
  const highCount = cents - lowCents * guests;
  const lowCount = guests - highCount;
  return {
    guests,
    highCents: highCount === 0 ? lowCents : lowCents + 1,
    highCount,
    lowCents,
    lowCount,
  };
}

export function splitStayLine(totalDollars: number, guests: number): string | null {
  const split = splitStay(totalDollars, guests);
  if (!split) return null;
  const tail = 'The shares add up to the stay total. Nothing is charged.';
  if (split.highCount === 0) {
    return `${people(split.guests)} would each cover ${money(split.lowCents)} of this stay, before tax. ${tail}`;
  }
  return `${people(split.highCount)} would cover ${money(split.highCents)} and ${people(split.lowCount)} would cover ${money(split.lowCents)}, before tax. ${tail}`;
}
