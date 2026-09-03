const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const NOTE_PAID = /\bPaid (\d{4}-\d{2}-\d{2})\b/;

export function paidDateFromExpense(expense: { paidDate?: string; note?: string }): string | null {
  if (expense.paidDate && ISO_DATE.test(expense.paidDate)) return expense.paidDate;
  return expense.note?.match(NOTE_PAID)?.[1] ?? null;
}

export function formatPaidDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const m = ISO_DATE.exec(iso);
  if (!m) return iso;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function stripPaidDatePrefix(note?: string): string {
  return (note ?? '').replace(/^Paid \d{4}-\d{2}-\d{2}(?: · )?/i, '').trim();
}

export function todayInUtah(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Denver' });
}
