import { MAX_ASK_NIGHTS, toLiveComps, toLiveSnaps } from '../src/lib/market/live';

/**
 * Local preview only. The deployed routes read the saved comp set and the asks; these fixtures let
 * the saved-comp cards and the save form be checked in a dev browser.
 */
const COMPS = [
  { id: 'preview-1', label: 'Saved · Sundance lodge', sleeps: 18, bedrooms: 7, distanceMi: 2.4, rating: 4.93, reviews: 64, area: 'Sundance', guestFavorite: true },
  { id: 'preview-2', label: 'Saved · Vivian Park home', sleeps: 16, bedrooms: 6, distanceMi: 0.9, rating: 4.88, reviews: 41, area: 'Vivian Park' },
  { id: 'preview-3', label: 'Saved · Provo Canyon estate', sleeps: 20, bedrooms: 8, distanceMi: 3.6, rating: 4.9, reviews: 28, area: 'Provo Canyon' },
];

const ASKS = [
  { compId: 'preview-1', date: '2026-12-01', nightlyRate: 2100 },
  { compId: 'preview-1', date: '2026-12-02', nightlyRate: 2450 },
  { compId: 'preview-2', date: '2026-12-01', nightlyRate: 1850 },
];

export function devCompSnapshots() {
  return {
    liveComps: toLiveComps(COMPS),
    snaps: [...ASKS, ...previewAsks],
    storageReads: 'ok' as const,
    source: 'dev-preview' as const,
  };
}

export function devCompSaved(body: { label?: string } = {}) {
  return {
    id: 'preview-new',
    label: body.label?.trim() || 'Saved comp',
    sleeps: 16,
    distanceMi: 2,
    createdAt: new Date().toISOString(),
    source: 'dev-preview' as const,
  };
}

/** A recorded ask in the preview, so the live ask path can be checked without a real comp set. */
export function devSaveCompAsks(body: { compId?: string; asks?: unknown } = {}) {
  const compId = typeof body.compId === 'string' ? body.compId : '';
  if (!compId) return { status: 400 as const, error: 'A comp id is required.' };
  if (!Array.isArray(body.asks) || body.asks.length === 0) {
    return { status: 400 as const, error: 'At least one night and rate are required.' };
  }
  if (body.asks.length > MAX_ASK_NIGHTS) {
    return { status: 400 as const, error: `Save at most ${MAX_ASK_NIGHTS} nights at a time.` };
  }
  // The same check the deployed route runs: a real calendar day and a rate above zero, every row.
  const rows = toLiveSnaps(body.asks.map((row) => (row && typeof row === 'object' ? { ...(row as object), compId } : row)));
  if (rows.length !== body.asks.length) {
    return { status: 400 as const, error: 'Every night needs a real date and a rate above zero. Nothing was written.' };
  }
  for (const row of rows) previewAsks.push({ compId, date: row.date, nightlyRate: row.nightlyRate });
  return { status: 201 as const, ok: true, saved: rows.length, compId };
}

const previewAsks: Array<{ compId: string; date: string; nightlyRate: number }> = [];
