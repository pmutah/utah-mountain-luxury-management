import { denverToday } from '../src/lib/market/dates';
import { holdLine, requestHouseLine, requestStatusLine, requestView } from '../src/lib/request-status';

/**
 * Local preview only. The deployed route reads the saved request by its token. This fixture serves
 * four fixed tokens, one per state, so the guest page can be checked without sending a real request.
 * Nothing here is a booking, and no token matches a real one.
 */
export const DEV_REQUEST_TOKENS = {
  waiting: '1'.repeat(32),
  declined: '2'.repeat(32),
  accepted: '3'.repeat(32),
  expired: '4'.repeat(32),
  cancelled: '6'.repeat(32),
  invalid: '5'.repeat(32),
} as const;

export function devRequestStatus(token: string) {
  const today = denverToday();
  const request = {
    propertyId: 'river',
    alsoPropertyId: token === DEV_REQUEST_TOKENS.accepted ? 'ranch' : undefined,
    checkIn: '2026-12-01',
    checkOut: '2026-12-04',
    guests: 12,
    children: 2,
  };

  if (token === DEV_REQUEST_TOKENS.declined) {
    const view = requestView(request, {
      requestId: 'preview-declined',
      stays: [],
      decline: { reason: 'too-many-guests', at: `${today}T15:00:00.000Z` },
      hold: null,
      asOf: today,
    });
    return preview(view!);
  }
  if (token === DEV_REQUEST_TOKENS.accepted) {
    const view = requestView(request, {
      requestId: 'preview-accepted',
      stays: [{ note: 'Direct request preview-accepted.', status: 'confirmed' }],
      hold: null,
      asOf: today,
    });
    return preview(view!);
  }
  if (token === DEV_REQUEST_TOKENS.expired) {
    // A hold made yesterday morning is over by any clock, so this state is stable whenever it runs.
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    yesterday.setUTCHours(15, 0, 0, 0);
    const view = requestView(request, {
      requestId: 'preview-expired',
      stays: [],
      hold: { expiresAt: yesterday.toISOString(), released: false },
      asOf: today,
    });
    return preview(view!);
  }
  if (token === DEV_REQUEST_TOKENS.cancelled) {
    const view = requestView(request, {
      requestId: 'preview-cancelled',
      stays: [{ note: 'Direct request preview-cancelled.', status: 'cancelled' }],
      hold: null,
      asOf: today,
    });
    return preview(view!);
  }
  if (token === DEV_REQUEST_TOKENS.waiting) {
    const at = new Date();
    at.setMinutes(at.getMinutes() + 30);
    const view = requestView(request, {
      requestId: 'preview-waiting',
      stays: [],
      hold: { expiresAt: at.toISOString() },
      asOf: today,
    });
    return preview(view!);
  }
  return null;
}

function preview(view: ReturnType<typeof requestView> & object) {
  return {
    status: view.status,
    houses: view.houses,
    houseLine: requestHouseLine(view.houses),
    checkIn: view.checkIn,
    checkOut: view.checkOut,
    nights: view.nights,
    ...(view.guests !== undefined ? { guests: view.guests } : {}),
    ...(view.children !== undefined ? { children: view.children } : {}),
    ...(view.heldUntil ? { heldUntil: view.heldUntil } : {}),
    ...(view.reason ? { reason: view.reason } : {}),
    ...(view.answeredAt ? { answeredAt: view.answeredAt } : {}),
    line: requestStatusLine(view),
    hold: holdLine(view),
    storageReads: 'ok' as const,
    source: 'dev-preview' as const,
  };
}
