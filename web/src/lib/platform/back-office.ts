/**
 * Roles, audit, tax report, growth, radar, season, and security headers.
 * Audit entries append. They never delete an expense or a reservation.
 */

import { FEATURE_CATALOG, type FeatureStatus } from './feature-catalog';
import { quoteWithTax } from './guest-ops';

export type Role = 'admin' | 'owner' | 'cleaner' | 'vendor';

const ABILITIES: Record<Role, string[]> = {
  admin: ['read-ledger', 'edit-expense', 'read-owner', 'read-lindon', 'read-clean'],
  owner: ['read-owner'],
  cleaner: ['read-clean'],
  vendor: ['read-task'],
};

export function can(role: Role, ability: string): boolean {
  return ABILITIES[role].includes(ability);
}

export type AuditEntry = { at: string; actor: string; action: string; target: string };

const REFUSED = new Set(['delete-expenses', 'delete-reservations', 'bulk-delete']);

export function appendAudit(log: AuditEntry[], entry: AuditEntry): { ok: true; log: AuditEntry[] } | { ok: false; reason: string } {
  if (REFUSED.has(entry.action)) {
    return { ok: false, reason: 'Bulk delete of expenses or reservations is refused.' };
  }
  return { ok: true, log: [...log, entry] };
}

export type DirectStay = { house: string; lodging: number; cleaning: number; channel: 'direct' | 'airbnb' | 'vrbo' };

export function lodgingTaxReport(stays: DirectStay[]): {
  confirmed: false;
  directEstimate: number;
  channelCollectedByOta: number;
  rows: { house: string; channel: string; estimatedTax: number | null; note: string }[];
} {
  const rows = stays.map((stay) => {
    if (stay.channel !== 'direct') {
      return {
        house: stay.house,
        channel: stay.channel,
        estimatedTax: null,
        note: 'The channel collected the tax. It is not in the direct estimate.',
      };
    }
    const quote = quoteWithTax({ lodging: stay.lodging, cleaning: stay.cleaning });
    return {
      house: stay.house,
      channel: 'direct',
      estimatedTax: Math.round((quote.stateTax + quote.countyTax) * 100) / 100,
      note: quote.note,
    };
  });
  const directEstimate = Math.round(rows.reduce((sum, row) => sum + (row.estimatedTax ?? 0), 0) * 100) / 100;
  const channelCollectedByOta = stays.filter((stay) => stay.channel !== 'direct').length;
  return { confirmed: false, directEstimate, channelCollectedByOta, rows };
}

export function form1099Totals(payees: { name: string; amount: number }[]): { name: string; amount: number }[] {
  const map = new Map<string, number>();
  for (const payee of payees) {
    map.set(payee.name, Math.round(((map.get(payee.name) ?? 0) + payee.amount) * 100) / 100);
  }
  return [...map.entries()].map(([name, amount]) => ({ name, amount }));
}

export function schEExport(): { included: false; reason: string } {
  return { included: false, reason: 'The 2025 filed return is locked. This export does not include it or change it.' };
}

export type PlatformAgent = {
  id: string;
  name: string;
  scope: string;
  risky: boolean;
  defaultOn: boolean;
  sends: false;
};

export const PLATFORM_AGENTS: PlatformAgent[] = [
  { id: 'revenue', name: 'Revenue', scope: 'Rates and opportunities', risky: true, defaultOn: false, sends: false },
  { id: 'listing', name: 'Listing', scope: 'Copy, photos, and amenities', risky: false, defaultOn: false, sends: false },
  { id: 'guest', name: 'Guest', scope: 'Inbox drafts and reviews', risky: true, defaultOn: false, sends: false },
  { id: 'ops', name: 'Ops', scope: 'Turns, maintenance, and snow', risky: true, defaultOn: false, sends: false },
  { id: 'finance', name: 'Finance', scope: 'Expenses, tax, and reconciliation', risky: false, defaultOn: false, sends: false },
  { id: 'owner', name: 'Owner', scope: 'Statements and owner questions', risky: false, defaultOn: false, sends: false },
  { id: 'growth', name: 'Growth', scope: 'Campaigns and tests', risky: true, defaultOn: false, sends: false },
  { id: 'co-host', name: 'Co-host', scope: 'The dashboard chat', risky: false, defaultOn: true, sends: false },
  { id: 'nora', name: 'Nora', scope: 'The guest stay link', risky: false, defaultOn: true, sends: false },
  { id: 'muse', name: 'Muse', scope: 'The bot tools', risky: false, defaultOn: true, sends: false },
  { id: 'amanda', name: 'Amanda', scope: 'The same tools as Muse', risky: false, defaultOn: true, sends: false },
];

export function approvalQueue(): { id: string; action: string; waiting: true; textSent: false }[] {
  return [];
}

export function funnelEvent(step: 'view' | 'quote' | 'checkout' | 'paid', house: string): {
  step: string;
  house: string;
  stored: false;
  sink: 'd1-when-bound';
} {
  return { step, house, stored: false, sink: 'd1-when-bound' };
}

export function abAssign(visitor: string, experiment: string, variants: string[]): string {
  if (variants.length === 0) return '';
  let hash = 0;
  const text = `${experiment}:${visitor}`;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  return variants[hash % variants.length] ?? variants[0]!;
}

export type RadarNote = { competitor: string; featureId: string; shipped: string; why: string };

/** Fixture notes a monthly read would diff. They are not a live scrape. */
export const RADAR_FIXTURE: RadarNote[] = [
  {
    competitor: 'Guesty',
    featureId: 'inbox-autosend',
    shipped: 'AutoReply confidence controls',
    why: 'Three luxury homes still need a person on anything that messages a guest.',
  },
  {
    competitor: 'Hospitable',
    featureId: 'seam-unlock',
    shipped: 'Lock and unlock from the guest app',
    why: 'Worth it once the lock model is known. Not before a Seam key exists.',
  },
  {
    competitor: 'PriceLabs',
    featureId: 'airroi-live',
    shipped: 'Daily comp calendars',
    why: 'The fixture is enough to build the desk. Live comps are the next dollar of budget.',
  },
];

export function radarDiff(notes: RadarNote[] = RADAR_FIXTURE): { featureId: string; status: FeatureStatus; backlog: string }[] {
  return notes.map((note) => {
    const row = FEATURE_CATALOG.find((item) => item.id === note.featureId);
    const status = row?.status ?? 'planned';
    return {
      featureId: note.featureId,
      status,
      backlog: `${note.competitor} shipped ${note.shipped}. ${note.why}`,
    };
  });
}

export type SeasonName = 'ski' | 'fall' | 'river' | 'quiet';

export function seasonFor(month: string): SeasonName {
  const value = Number(month.slice(5, 7));
  if (value === 12 || (value >= 1 && value <= 3)) return 'ski';
  if (value === 9 || value === 10) return 'fall';
  if (value === 6 || value === 7) return 'river';
  return 'quiet';
}

export const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'SAMEORIGIN',
  'Content-Security-Policy-Report-Only': "default-src 'self' https: data: blob: 'unsafe-inline' 'unsafe-eval'",
  'Permissions-Policy': 'geolocation=(), camera=()',
};

export function logEvent(event: Record<string, unknown>): string {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(event)) {
    if (/secret|token|password|api[_-]?key/i.test(key)) continue;
    clean[key] = value;
  }
  return JSON.stringify({ t: new Date().toISOString(), ...clean });
}

export function housePin(
  stays: { propertyId: string; checkIn: string; checkOut: string; status?: string }[],
  house: string,
  asOf: string,
): 'occupied' | 'turnover' | 'vacant' {
  const rows = stays.filter((stay) => stay.propertyId === house && stay.status !== 'cancelled' && stay.status !== 'blocked');
  if (rows.some((stay) => stay.checkOut === asOf)) return 'turnover';
  if (rows.some((stay) => stay.checkIn <= asOf && asOf < stay.checkOut)) return 'occupied';
  return 'vacant';
}

export const CANYON_STATUS = 'Provo Canyon road status is not connected. This map does not say whether the road is open.';
export const SNOW_STATUS = 'Sundance snow is not connected. No depth is shown.';
