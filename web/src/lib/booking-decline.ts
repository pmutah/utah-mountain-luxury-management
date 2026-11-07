/**
 * Declining a direct request. The inbox could accept but not decline, so a host who could not take a
 * stay had to wait out the 30-minute hold and the guest was left with "someone will write back".
 *
 * A decline is a decision with a reason, recorded on the request so the inbox shows who handled it.
 * It never touches a booking, an expense, or a receipt.
 */
import { housesForRequest } from './availability';
import { isRealDay } from './market/dates';
import type { HouseId } from './market/types';

/** The reasons a host actually gives. A free-text reason is allowed too, but these cover most. */
export const DECLINE_REASONS = [
  'dates-taken',
  'too-many-guests',
  'minimum-stay',
  'maintenance',
  'owner-stay',
  'other',
] as const;

export type DeclineReason = (typeof DECLINE_REASONS)[number];

const LABEL: Record<DeclineReason, string> = {
  'dates-taken': 'Those dates are taken',
  'too-many-guests': 'The party is larger than the house allows',
  'minimum-stay': 'The stay is shorter than the house asks for',
  maintenance: 'The house is closed for work',
  'owner-stay': 'The family is using the house',
  other: 'We cannot take the stay',
};

export function isDeclineReason(value: unknown): value is DeclineReason {
  return typeof value === 'string' && (DECLINE_REASONS as readonly string[]).includes(value);
}

export type DeclineRecord = {
  reason: DeclineReason;
  /** The host's own words, when they chose `other` or wanted to add detail. */
  note?: string;
  at: string;
};

export type Declinable = {
  id: string;
  propertyId?: string;
  alsoPropertyId?: string;
  checkIn?: string;
  checkOut?: string;
  guests?: number;
};

/**
 * Whether this request may be declined. A request that already became a booking must not be declined,
 * because that would tell the guest to stop coming after the stay was saved.
 */
export function canDecline(input: {
  request: Declinable | null;
  accepted: boolean;
  alreadyDeclined: boolean;
}): { ok: true } | { ok: false; reason: string } {
  if (!input.request) return { ok: false, reason: 'This request is not on the list.' };
  if (input.accepted) {
    return { ok: false, reason: 'This request is already a booking. Decline would tell the guest to stop.' };
  }
  if (input.alreadyDeclined) return { ok: false, reason: 'This request is already declined.' };
  if (!isRealDay(input.request.checkIn ?? '') || !isRealDay(input.request.checkOut ?? '')) {
    return { ok: false, reason: 'This request does not name dates we can decline.' };
  }
  return { ok: true };
}

/** The record to save. A note is trimmed and capped so it cannot carry a whole email. */
export function declineRecord(reason: DeclineReason, note: string | undefined, now = new Date()): DeclineRecord {
  const trimmed = typeof note === 'string' ? note.trim().slice(0, 200) : '';
  return { reason, ...(trimmed ? { note: trimmed } : {}), at: now.toISOString() };
}

/** A line for the inbox. It names the reason and never a guest name or a price. */
export function declineLine(record: DeclineRecord): string {
  const base = `Declined: ${LABEL[record.reason]}.`;
  const note = record.note ? ` “${record.note}”` : '';
  const line = `${base}${note} The dates are free again when the hold ends. Nothing was booked.`;
  return line.includes('$') ? `${base} The dates are free again. Nothing was booked.` : line;
}

/** What the guest reads for each reason. Written so the sentence can stand alone. */
const GUEST_REASON: Record<DeclineReason, string> = {
  'dates-taken': 'Those nights are already spoken for at that house.',
  'too-many-guests': 'That house cannot hold a party this size.',
  'minimum-stay': 'That stay is shorter than the house asks for at that time of year.',
  maintenance: 'The house is closed for work on those dates.',
  'owner-stay': 'The owners are using the house on those dates.',
  other: 'Those dates are not open this time.',
};

/**
 * What the guest is told. It says the dates are not available, gives a plain reason, and invites a
 * different range. It never quotes a price and never promises a different house.
 */
export function guestDeclineMail(input: {
  guestName: string;
  houses: readonly string[];
  checkIn: string;
  checkOut: string;
  reason: DeclineReason;
  /** The host's own words when they added them. Kept short and off the subject line. */
  note?: string;
  /**
   * A link back to the booking page with these dates and party filled in. A declined guest should be
   * able to move the dates themselves rather than only replying to an email.
   */
  retryHref?: string;
  /** The absolute origin, so the link in an email is clickable. */
  origin?: string;
}): { subject: string; body: string } {
  const first = input.guestName.split(' ')[0] || input.guestName;
  const when = `${longDate(input.checkIn)} to ${longDate(input.checkOut)}`;
  const extra = input.note?.trim().slice(0, 200);
  const base = input.origin?.replace(/\/$/, '') ?? '';
  const retry =
    input.retryHref && /^\/[A-Za-z0-9/_?=&%.-]*$/.test(input.retryHref)
      ? `${base}${input.retryHref}`
      : '';
  const body = [
    `Hi ${first},`,
    '',
    `Thank you for asking about ${input.houses.join(' and ')} for ${when}.`,
    '',
    GUEST_REASON[input.reason],
    ...(extra ? [extra] : []),
    'We are sorry we cannot take this one.',
    '',
    retry
      ? `You can move the dates yourself here: ${retry}`
      : 'If your dates can move, reply to this message with a range and we will look again.  This reply comes to the same inbox.',
    ...(retry ? ['Or reply to this message with a range and we will look again.'] : []),
    '',
    'Utah Mountain Luxury',
  ].join('\n');
  const subject = 'Your dates are not available · Utah Mountain Luxury';
  const clean = (text: string) => text.replace(/\$\s?\d[\d,.]*/g, '');
  return { subject: clean(subject), body: clean(body) };
}

function longDate(iso: string): string {
  if (!isRealDay(iso)) return '';
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day)).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** The houses a decline covers, for the guest mail. */
export function declineHouses(request: Declinable): HouseId[] {
  return housesForRequest(request.propertyId ?? '', request.alsoPropertyId ?? '');
}

/**
 * Why requests were declined over a window. A host who keeps turning down the same reason is looking
 * at a pricing or policy problem, so this counts the reasons rather than listing the requests.
 * No guest name and no price appears here.
 */
export type DeclineTally = {
  total: number;
  byReason: Array<{ reason: DeclineReason; label: string; count: number }>;
  /** A sentence for the desk. It names the top reason, or says there is nothing to report. */
  line: string;
};

const TALLY_LABEL: Record<DeclineReason, string> = {
  'dates-taken': 'dates taken',
  'too-many-guests': 'party too large',
  'minimum-stay': 'stay too short',
  maintenance: 'closed for work',
  'owner-stay': 'family using the house',
  other: 'other',
};

/** A tally of declines since a day. A record with an unknown reason is left out rather than guessed. */
export function declineTally(records: readonly { reason: unknown; at: string }[], from: string): DeclineTally {
  const inWindow = records.filter((row) => typeof row.at === 'string' && row.at.slice(0, 10) >= from);
  const counts = new Map<DeclineReason, number>();
  for (const row of inWindow) {
    if (!isDeclineReason(row.reason)) continue;
    counts.set(row.reason, (counts.get(row.reason) ?? 0) + 1);
  }
  const byReason = [...counts.entries()]
    .map(([reason, count]) => ({ reason, label: TALLY_LABEL[reason], count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));
  const total = byReason.reduce((sum, row) => sum + row.count, 0);
  if (total === 0) {
    return { total: 0, byReason: [], line: 'No request was declined in the last 30 days.' };
  }
  const top = byReason[0]!;
  const noun = total === 1 ? '1 request' : `${total} requests`;
  const detail =
    byReason.length === 1
      ? `all because ${top.label}`
      : `most often because ${top.label} (${top.count} of ${total})`;
  const line = `${noun} declined in the last 30 days, ${detail}. A repeated reason is worth a rate or rule check.`;
  return { total, byReason, line: line.includes('$') ? 'Requests were declined. A repeated reason is worth a rate or rule check.' : line };
}
