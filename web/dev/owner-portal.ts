import { ownerPortalView } from '../src/lib/owner-portal';
import type { OwnerStatement } from '../src/lib/owner-statement';
import { denverToday } from '../src/lib/market/dates';

/*
 * Local preview only. The deployed routes read the saved links and the real ledger; these fixtures
 * let the owner portal and the host link card be checked in a dev browser.
 *
 * The house lines carry their own working (`cleaning`, `fee`, `leftover`) because the statement prints
 * it. A preview that omitted those fields would typecheck only if they were made optional, and an
 * optional field on a money statement is how a blank figure reaches an owner.
 */
const PREVIEW_TOKEN = '0123456789abcdef0123456789abcdef';

/** Build a house line from the figures a preview wants, so the working always reconciles. */
function previewHouse(id: 'ranch' | 'river', name: string, revenue: number, cleaning: number, operating: number, stays: number) {
  const fee = Math.round((revenue - cleaning) * 0.2 * 100) / 100;
  const leftover = Math.round((revenue - cleaning - fee - operating) * 100) / 100;
  return {
    id,
    name,
    revenue,
    costs: Math.round((cleaning + operating) * 100) / 100,
    cleaning,
    estimatedCleaning: 0,
    fee,
    leftover,
    todd: Math.round((leftover / 2) * 100) / 100,
    stays,
  };
}

const PREVIEW_HOUSES = [
  previewHouse('ranch', 'The Ranch House', 61200, 8600, 6200, 18),
  previewHouse('river', 'The River House', 24100, 3400, 2700, 7),
];

const STATEMENT: OwnerStatement = {
  rangeLabel: 'January – November 2026',
  todd: Math.round((PREVIEW_HOUSES.reduce((total, house) => total + house.todd, 0)) * 100) / 100,
  fee: Math.round((PREVIEW_HOUSES.reduce((total, house) => total + house.fee, 0)) * 100) / 100,
  houses: PREVIEW_HOUSES,
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
