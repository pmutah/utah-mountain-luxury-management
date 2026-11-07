import { ownerPortalView } from '../src/lib/owner-portal';
import type { OwnerStatement } from '../src/lib/owner-statement';
import { denverToday } from '../src/lib/market/dates';

/**
 * Local preview only. The deployed routes read the saved links and the real ledger; these fixtures
 * let the owner portal and the host link card be checked in a dev browser.
 */
const PREVIEW_TOKEN = '0123456789abcdef0123456789abcdef';

const STATEMENT: OwnerStatement = {
  rangeLabel: 'January – November 2026',
  todd: 41250.44,
  fee: 18304.62,
  houses: [
    { id: 'ranch', name: 'The Ranch House', revenue: 61200, costs: 14800, todd: 30125.5, stays: 18 },
    { id: 'river', name: 'The River House', revenue: 24100, costs: 6100, todd: 11124.94, stays: 7 },
  ],
  months: [
    { month: '2026-08', label: 'August 2026', todd: 8100.25, ranch: 6550, river: 1550.25 },
    { month: '2026-09', label: 'September 2026', todd: 7420.75, ranch: 5900, river: 1520.75 },
    { month: '2026-10', label: 'October 2026', todd: 9680.4, ranch: 7700, river: 1980.4 },
    { month: '2026-11', label: 'November 2026', todd: 16049.04, ranch: 9975.5, river: 6073.54 },
  ],
};

export function devOwnerPortal(period: string | null, token: string) {
  if (token !== PREVIEW_TOKEN) return { error: 'This owner link is not valid.' };
  const scope = period === 'month' ? 'month' : 'ytd';
  const view = ownerPortalView(STATEMENT, scope);
  return {
    ...view,
    period: scope,
    month: denverToday().slice(0, 7),
    empty: false,
    storageReads: 'ok' as const,
    source: 'dev-preview' as const,
  };
}

export function devOwnerLinks() {
  return {
    links: [
      {
        token: PREVIEW_TOKEN,
        path: `/owner/${PREVIEW_TOKEN}`,
        createdAt: `${denverToday()}T08:00:00.000Z`,
        lastViewedAt: null,
        views: 0,
      },
    ],
    storageReads: 'ok' as const,
    source: 'dev-preview' as const,
  };
}

export function devOwnerMint() {
  return { token: PREVIEW_TOKEN, path: `/owner/${PREVIEW_TOKEN}`, createdAt: new Date().toISOString(), source: 'dev-preview' as const };
}
