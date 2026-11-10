/**
 * What a direct booking is owed, what has arrived, and what is still outstanding.
 *
 * The booking site can quote a stay, record it, and show the guest total — but nothing recorded money
 * arriving. `guestTotal` was a figure with no counterpart: a host looking at a confirmed direct booking
 * could not tell whether the guest had paid, part-paid, or paid nothing, so "what is still owed" had no
 * answer anywhere in the app.
 *
 * Two rules keep this honest:
 *
 *   - **A payment is its own record.** It is never a field that gets overwritten, so the history of what
 *     arrived and when survives, and a refund is a negative payment rather than a deletion.
 *   - **Absent is not zero.** A direct booking with no payments recorded has an `outstanding` equal to
 *     its total only when the total is known. Where the total is unknown the answer is `unknown`, never
 *     a confident `$0` and never an invented figure.
 *
 * A channel booking (Airbnb, VRBO, Hospitable) is deliberately out of scope: the platform collects from
 * the guest and remits a payout, so `payout` is the money and there is no guest balance for us to track.
 */

export type PaymentMethod = 'card' | 'ach' | 'cash' | 'check' | 'other';

export type Payment = {
  id: string;
  /** Whole dollars and cents actually received. A refund is negative. */
  amount: number;
  /** Calendar day the money landed, `YYYY-MM-DD`. */
  receivedOn: string;
  method?: PaymentMethod;
  /** Free text: a check number, a processor reference, who took it. */
  reference?: string;
  note?: string;
};

/** The sources where the guest pays us directly, so a balance is ours to track. */
const DIRECT_SOURCES = new Set(['direct', 'website', 'own-site', 'manual']);

export function isDirectSource(source: string | undefined | null): boolean {
  return DIRECT_SOURCES.has(String(source ?? '').trim().toLowerCase());
}

/**
 * Coerce a stored amount.
 *
 * `NaN`, `Infinity`, and a non-number are not money. They read as absent rather than as zero, because a
 * payment that cannot be read must not be counted as one that arrived, and must not silently vanish from
 * a total either — the caller is told the row is unusable.
 */
export function parseAmount(value: unknown): number | null {
  /*
   * An empty string, whitespace, and `null` are how a blank form field arrives. `Number('')` is `0`, so
   * without this check a blank amount would be counted as a payment of zero — and a blank guest total
   * would become a $0 price. Absent has to stay absent.
   */
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function isRealDay(value: unknown): value is string {
  if (typeof value !== 'string' || !DAY.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export type PaymentLedger = {
  /** Every payment that could be read, oldest first. */
  payments: Payment[];
  /** Money that arrived, net of refunds. */
  received: number;
  /** What the guest was quoted, or null when the booking never carried a figure. */
  total: number | null;
  /** Money still owed. Null when the total is unknown — never a stand-in number. */
  outstanding: number | null;
  /** True once received covers the total. False when the total is unknown. */
  paidInFull: boolean;
  /** Rows that could not be read, named rather than dropped, so a bad row is visible. */
  rejected: Array<{ id: string; reason: string }>;
  /** One line a host can read without doing arithmetic. */
  line: string;
};

export type LedgerInput = {
  source?: string;
  /** What the guest was quoted. Absent or unusable means unknown. */
  guestTotal?: number | null;
  payments?: readonly unknown[];
};

function money(n: number): string {
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  return `${sign}$${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Build the ledger for one booking.
 *
 * A refund is a negative amount, so it reduces `received` without erasing the payment that preceded it.
 * A same-day refund of a same-day payment therefore nets to zero and the booking reads as unpaid rather
 * than as paid and separately refunded — that is the answer a host acting on the balance needs.
 */
export function paymentLedger(input: LedgerInput): PaymentLedger {
  const rejected: Array<{ id: string; reason: string }> = [];
  const payments: Payment[] = [];

  for (const [index, raw] of (input.payments ?? []).entries()) {
    if (!raw || typeof raw !== 'object') {
      rejected.push({ id: `#${index}`, reason: 'not a payment' });
      continue;
    }
    const row = raw as Partial<Payment> & { amount?: unknown };
    const id = typeof row.id === 'string' && row.id.trim() ? row.id.trim() : `#${index}`;
    const amount = parseAmount(row.amount);
    if (amount === null) {
      rejected.push({ id, reason: 'amount is not a number' });
      continue;
    }
    if (amount === 0) {
      // A zero payment records nothing. Keeping it would make a list look like activity that never happened.
      rejected.push({ id, reason: 'zero amount' });
      continue;
    }
    if (!isRealDay(row.receivedOn)) {
      rejected.push({ id, reason: 'receivedOn is not a calendar day' });
      continue;
    }
    payments.push({
      id,
      amount,
      receivedOn: row.receivedOn,
      ...(row.method ? { method: row.method } : {}),
      ...(row.reference ? { reference: String(row.reference).trim() } : {}),
      ...(row.note ? { note: String(row.note).trim() } : {}),
    });
  }

  payments.sort((a, b) => a.receivedOn.localeCompare(b.receivedOn) || a.id.localeCompare(b.id));

  const received = Math.round(payments.reduce((sum, p) => sum + p.amount, 0) * 100) / 100;

  const total = (() => {
    const parsed = parseAmount(input.guestTotal);
    // A total must be positive. Zero or negative is not a price, it is a missing one.
    return parsed !== null && parsed > 0 ? parsed : null;
  })();

  if (!isDirectSource(input.source)) {
    return {
      payments,
      received,
      total,
      outstanding: null,
      paidInFull: false,
      rejected,
      line:
        total !== null
          ? `Booked through ${input.source ?? 'another channel'}. The platform collects from the guest and pays out ${money(total)} was the guest ask; this balance is not ours to collect.`
          : `Booked through ${input.source ?? 'another channel'}. The platform collects from the guest; no guest balance is tracked here.`,
    };
  }

  if (total === null) {
    return {
      payments,
      received,
      total: null,
      outstanding: null,
      paidInFull: false,
      rejected,
      line:
        received > 0
          ? `${money(received)} received, and this booking carries no guest total, so what is still owed is unknown.`
          : 'This booking carries no guest total, so what is still owed is unknown. Nothing has been recorded as received.',
    };
  }

  const outstanding = Math.round((total - received) * 100) / 100;
  const paidInFull = outstanding <= 0;

  const line = paidInFull
    ? outstanding === 0
      ? `Paid in full: ${money(received)} of ${money(total)}.`
      : `Paid: ${money(received)} against ${money(total)}, ${money(Math.abs(outstanding))} over.`
    : received === 0
      ? `Nothing received yet. ${money(outstanding)} of ${money(total)} is still owed.`
      : `${money(received)} of ${money(total)} received. ${money(outstanding)} is still owed.`;

  return { payments, received, total, outstanding, paidInFull, rejected, line };
}

/**
 * Every direct booking still owed money, worst first.
 *
 * Channel bookings are excluded because their money arrives as a payout, and a booking with no known
 * total is excluded because a balance cannot be stated for it — both are named in `skipped` so a host
 * can see what is not in the list rather than assuming the list is everything.
 */
export function outstandingBookings<
  T extends { id: string; source?: string; guestTotal?: number | null; payments?: readonly unknown[]; checkIn?: string },
>(bookings: readonly T[]): { rows: Array<T & { ledger: PaymentLedger }>; skipped: Array<{ id: string; reason: string }>; total: number } {
  const rows: Array<T & { ledger: PaymentLedger }> = [];
  const skipped: Array<{ id: string; reason: string }> = [];

  for (const booking of bookings) {
    if (!isDirectSource(booking.source)) {
      skipped.push({ id: booking.id, reason: 'not a direct booking' });
      continue;
    }
    const ledger = paymentLedger(booking);
    if (ledger.total === null) {
      skipped.push({ id: booking.id, reason: 'no guest total' });
      continue;
    }
    if (ledger.paidInFull) {
      skipped.push({ id: booking.id, reason: 'paid in full' });
      continue;
    }
    rows.push({ ...booking, ledger });
  }

  // Worst first, then soonest stay, so the top of the list is what to chase.
  rows.sort((a, b) => {
    const diff = (b.ledger.outstanding ?? 0) - (a.ledger.outstanding ?? 0);
    if (diff !== 0) return diff;
    return String(a.checkIn ?? '').localeCompare(String(b.checkIn ?? ''));
  });

  const total = Math.round(rows.reduce((sum, r) => sum + (r.ledger.outstanding ?? 0), 0) * 100) / 100;
  return { rows, skipped, total };
}
