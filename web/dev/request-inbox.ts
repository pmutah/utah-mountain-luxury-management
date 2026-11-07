import { bookingInbox, inboxSummary } from '../src/lib/booking-inbox';
import { declineTally } from '../src/lib/booking-decline';
import { suggestedPayoutLine, suggestedPayouts } from '../src/lib/payout-suggest';
import { denverToday } from '../src/lib/market/dates';

/**
 * Local preview only. The deployed route reads the saved requests; this fixture is sample rows
 * so the host inbox can be checked in a dev browser. The panel says it is a preview.
 */
export const DEV_REQUEST_PREVIEW = 'Sample rows for a local preview. The saved requests are on the deployed route.';

/** The sample requests. Kept as a named list so the payout preview can look up each one. */
const SAMPLE = [
  {
    id: 'preview-open',
    propertyId: 'river',
    checkIn: '2026-12-01',
    checkOut: '2026-12-04',
    guests: 8,
    createdAt: '2026-11-06T09:00:00.000Z',
  },
  {
    id: 'preview-together',
    propertyId: 'river',
    alsoPropertyId: 'ranch',
    checkIn: '2026-12-15',
    checkOut: '2026-12-18',
    guests: 30,
    children: 4,
    createdAt: '2026-11-06T09:05:00.000Z',
  },
  {
    id: 'preview-taken',
    propertyId: 'ranch',
    checkIn: '2026-12-20',
    checkOut: '2026-12-22',
    guests: 10,
    createdAt: '2026-11-06T09:10:00.000Z',
  },
] as Array<{
  id: string;
  propertyId: string;
  alsoPropertyId?: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  children?: number;
  createdAt: string;
}>;

export function devBookingRequests() {
  const today = denverToday();
  const rows = bookingInbox(SAMPLE, { river: [], ranch: ['2026-12-20'], lindon: [] }, today);
  // One preview row is already a booking, so the refused path is visible too.
  const tally = declineTally(
    [
      { reason: 'dates-taken', at: `${today}T09:00:00Z` },
      { reason: 'dates-taken', at: `${today}T09:30:00Z` },
      { reason: 'minimum-stay', at: `${today}T10:00:00Z` },
    ],
    today,
  );
  return {
    // The real route attaches a suggested payout to each row. The preview does the same from the same
    // quote code, so the pre-filled figure can be checked without a real request.
    rows: rows.map((row) => {
      const saved = SAMPLE.find((item) => item.id === row.id);
      const payouts = saved
        ? suggestedPayouts({
            propertyId: saved.propertyId,
            alsoPropertyId: saved.alsoPropertyId,
            checkIn: saved.checkIn,
            checkOut: saved.checkOut,
            ...(saved.guests !== undefined ? { guests: saved.guests } : {}),
            ...(saved.children !== undefined ? { children: saved.children } : {}),
          })
        : [];
      const priced = { ...row, payouts, payoutLine: suggestedPayoutLine(payouts) };
      return row.id === 'preview-together' ? { ...priced, accepted: true } : priced;
    }),
    summary: inboxSummary(rows),
    declineTally: tally,
    storageReads: 'ok' as const,
    source: 'dev-preview' as const,
  };
}

/** The local accept. It mirrors the route: a payout is required, and one row is already booked. */
export function devAcceptRequest(body: { id?: string; payout?: unknown } = {}) {
  const id = typeof body.id === 'string' ? body.id : '';
  if (id === 'preview-together') {
    return { status: 409 as const, error: 'This request is already a booking. A second accept would double the stay.' };
  }
  if (!id) return { status: 400 as const, error: 'A request id is required.' };
  if (typeof body.payout !== 'number' || !Number.isFinite(body.payout) || body.payout < 0) {
    return { status: 409 as const, error: 'A host payout has to be zero or more.' };
  }
  return {
    status: 201 as const,
    ok: true,
    reservationId: 'res-preview',
    line: 'The River House is booked for 3 nights. The host payout is saved. Nothing was sent to the guest from here.',
    portalLink: 'http://localhost:5173/stay/0123456789abcdef0123456789abcdef',
    portalError: null,
    portalNote: 'The guest app is off for this house, so that link will say the app is off. Turn it on in Guests before the guest arrives.',
    guideOn: false,
    guestEmailed: false,
    guestEmailError: 'Gmail is not connected in this local preview.',
    guestLine: null,
  };
}

/** The local decline. It mirrors the route's refusals so the UI paths can be checked. */
export function devDeclineRequest(body: { id?: string; reason?: unknown } = {}) {
  const id = typeof body.id === 'string' ? body.id : '';
  if (!id) return { status: 400 as const, error: 'A request id is required.' };
  if (typeof body.reason !== 'string' || !body.reason) {
    return { status: 400 as const, error: 'Choose a reason before declining.' };
  }
  if (id === 'preview-together') {
    return { status: 409 as const, error: 'This request is already a booking. Decline would tell the guest to stop.' };
  }
  return {
    status: 200 as const,
    ok: true,
    line: 'Declined: Those dates are taken. The dates are free again when the hold ends. Nothing was booked.',
    reason: body.reason,
    guestEmailed: false,
    guestEmailError: 'Gmail is not connected in this local preview.',
  };
}
