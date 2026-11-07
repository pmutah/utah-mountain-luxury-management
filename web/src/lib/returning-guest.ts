/**
 * Whether the person asking is a past guest. The booking form used to send `returning: false` always,
 * so the team was told every request was from someone new. This is the lookup that answers it.
 *
 * It compares what the guest typed against past stays. Only a contact match counts: a name alone is
 * not enough, because two people share a name and a wrong "returning" would price a stranger as a
 * repeat guest.
 */

export type PastStay = {
  guestName?: string;
  guestEmail?: string;
  guestPhone?: string;
  status?: string;
  checkOut?: string;
};

export type ReturningCheck = {
  returning: boolean;
  /** The most recent past checkout, when there is one. It is a date, not a name. */
  lastStay: string | null;
  /** How many past stays matched. */
  stays: number;
};

/** Digits only, with a US country code dropped, so `+1 (801) 787-4722` and `8017874722` match. */
export function phoneKey(value: string | undefined): string {
  if (typeof value !== 'string') return '';
  const digits = value.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  return digits.length >= 10 ? digits.slice(-10) : '';
}

/** Lowercased, trimmed, so a case difference does not hide a past stay. */
export function emailKey(value: string | undefined): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim().toLowerCase();
  return trimmed.includes('@') ? trimmed : '';
}

/**
 * The returning check. An email or a phone that matches a past stay counts. A cancelled or blocked
 * stay does not, and a stay whose checkout has not happened yet is not a past stay.
 */
export function returningGuest(
  input: { email?: string; phone?: string },
  past: readonly PastStay[],
  asOf: string,
): ReturningCheck {
  const email = emailKey(input.email);
  const phone = phoneKey(input.phone);
  if (!email && !phone) return { returning: false, lastStay: null, stays: 0 };
  const matches = past.filter((stay) => {
    if (stay.status === 'cancelled' || stay.status === 'blocked') return false;
    if (!stay.checkOut || !/^\d{4}-\d{2}-\d{2}$/.test(stay.checkOut) || stay.checkOut > asOf) return false;
    if (email && emailKey(stay.guestEmail) === email) return true;
    if (phone && phoneKey(stay.guestPhone) === phone) return true;
    return false;
  });
  const dates = matches.map((stay) => stay.checkOut!).sort();
  return {
    returning: matches.length > 0,
    lastStay: dates[dates.length - 1] ?? null,
    stays: matches.length,
  };
}

/** A line for the host. It says returning and when, and never repeats the contact detail. */
export function returningLine(check: ReturningCheck): string {
  if (!check.returning) return 'New to us, or they did not say.';
  const when = check.lastStay
    ? new Date(`${check.lastStay}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    : null;
  const count = check.stays === 1 ? '1 past stay' : `${check.stays} past stays`;
  return when ? `They have stayed before. Last stay ${when} (${count}).` : `They have stayed before (${count}).`;
}
